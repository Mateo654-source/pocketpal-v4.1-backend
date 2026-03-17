/**
 * @file src/db/init.js
 * @description Inicialización de la base de datos MySQL.
 *
 * Este módulo crea todas las tablas si no existen y siembra las categorías
 * globales por defecto. Se llama UNA sola vez al arrancar el servidor
 * (desde server.js) antes de aceptar peticiones HTTP.
 *
 * Orden de creación respeta las dependencias de foreign keys:
 *   users → categories → transactions → goals → goal_allocations → ai_chat_history
 */

import { pool } from "../config/db.js";

// ─── Definición de tablas ────────────────────────────────────────────────────
// IMPORTANTE: mysql2 no acepta múltiples sentencias por execute(), por eso
// cada tabla está en su propio string y se ejecuta en un loop.

const TABLES = [
    /**
     * Tabla users — Almacena todos los usuarios del sistema.
     * - password_hash: NULL para usuarios que solo se autentican con Google.
     * - google_id: identificador único de Google OAuth.
     * - avatar: URL de la foto de perfil (de Google o null).
     * - google_access_token / google_refresh_token: tokens de Google para Gmail API.
     */
    `CREATE TABLE IF NOT EXISTS users (
    id                    INT AUTO_INCREMENT PRIMARY KEY,
    name                  VARCHAR(100)  NOT NULL,
    email                 VARCHAR(150)  NOT NULL,
    password_hash         VARCHAR(255)  DEFAULT NULL,
    google_id             VARCHAR(255)  DEFAULT NULL,
    avatar                VARCHAR(500)  DEFAULT NULL,
    google_access_token   TEXT          DEFAULT NULL,
    google_refresh_token  TEXT          DEFAULT NULL,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_users_email    (email),
    UNIQUE KEY uq_users_google   (google_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    /**
     * Tabla categories — Categorías de transacciones.
     * - user_id NULL → categoría global (disponible para todos los usuarios).
     * - user_id con valor → categoría personalizada del usuario.
     * NOTA: La restricción UNIQUE es por (name, type, user_id) para permitir
     * que distintos usuarios creen categorías con el mismo nombre.
     */
    `CREATE TABLE IF NOT EXISTS categories (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(100) NOT NULL,
    type       ENUM('income','expense') NOT NULL,
    user_id    INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_cat_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_cat_name_type_user (name, type, user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    /**
     * Tabla transactions — Registro de movimientos financieros.
     * - type: 'income' (ingreso), 'expense' (gasto), 'saving' (aporte a meta).
     * - Los aportes a metas (type='saving') reducen el balance disponible.
     * - Índice compuesto (user_id, date) acelera las consultas de historial.
     */
    `CREATE TABLE IF NOT EXISTS transactions (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NOT NULL,
    category_id INT NOT NULL,
    type        ENUM('income', 'expense', 'saving') NOT NULL,
    amount      DECIMAL(12,2) NOT NULL,
    description TEXT,
    date        DATE NOT NULL DEFAULT (CURRENT_DATE),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_tx_user_date (user_id, date DESC),
    INDEX idx_tx_user_type (user_id, type),
    CONSTRAINT fk_tx_user     FOREIGN KEY (user_id)     REFERENCES users(id)       ON DELETE CASCADE,
    CONSTRAINT fk_tx_category FOREIGN KEY (category_id) REFERENCES categories(id),
    CONSTRAINT chk_tx_amount  CHECK (amount > 0)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    /**
     * Tabla goals — Metas de ahorro del usuario.
     * - current_amount: suma acumulada de todos los aportes (goal_allocations).
     * - is_completed: 1 cuando current_amount >= target_amount.
     * - completion_type: decisión del usuario al completar ('saving', 'spend', etc.).
     * BUG FIX: eliminado UNIQUE en title — distintos usuarios pueden tener
     * metas con el mismo nombre.
     */
    `CREATE TABLE IF NOT EXISTS goals (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL,
    title           VARCHAR(200) NOT NULL,
    target_amount   DECIMAL(12,2) NOT NULL,
    current_amount  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    is_completed    TINYINT(1) NOT NULL DEFAULT 0,
    completion_type VARCHAR(50) DEFAULT NULL,
    completed_at    TIMESTAMP NULL DEFAULT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_goal_user  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_goal_amt  CHECK (target_amount > 0)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    /**
     * Tabla goal_allocations — Historial de aportes a metas.
     * Cada fila representa un "abono" del usuario a una meta específica.
     * La suma de todos los aportes de una meta = goals.current_amount.
     */
    `CREATE TABLE IF NOT EXISTS goal_allocations (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT NOT NULL,
    goal_id    INT NOT NULL,
    amount     DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_alloc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_alloc_goal FOREIGN KEY (goal_id) REFERENCES goals(id)  ON DELETE CASCADE,
    CONSTRAINT chk_alloc_amt CHECK (amount > 0)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    /**
     * Tabla ai_chat_history — Historial de conversaciones con el agente NOVA.
     * - role: 'user' (mensaje del usuario) o 'assistant' (respuesta de la IA).
     * - El índice por (user_id, created_at DESC) acelera la carga del historial.
     */
    `CREATE TABLE IF NOT EXISTS ai_chat_history (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT NOT NULL,
    role       ENUM('user','assistant') NOT NULL,
    content    TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_chat_user (user_id, created_at DESC),
    CONSTRAINT fk_chat_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

// ─── Categorías globales por defecto ─────────────────────────────────────────
// user_id = NULL → disponibles para TODOS los usuarios.
// Se insertan solo si no existen (idempotente).

const DEFAULT_CATEGORIES = [
    // Ingresos
    { name: "Salario", type: "income" },
    { name: "Freelance", type: "income" },
    { name: "Inversiones", type: "income" },
    { name: "Bonos", type: "income" },
    { name: "Ventas", type: "income" },
    { name: "Otros ingresos", type: "income" },
    // Gastos
    { name: "Alimentación", type: "expense" },
    { name: "Transporte", type: "expense" },
    { name: "Arriendo", type: "expense" },
    { name: "Entretenimiento", type: "expense" },
    { name: "Salud", type: "expense" },
    { name: "Educación", type: "expense" },
    { name: "Ropa", type: "expense" },
    { name: "Servicios", type: "expense" },
    { name: "Tecnología", type: "expense" },
    { name: "Restaurantes", type: "expense" },
    { name: "Supermercado", type: "expense" },
    { name: "Otros gastos", type: "expense" },
    // Ahorro (usado por aportes a metas)
    // { name: "Ahorro", type: "expense" },
];

/**
 * Inicializa la base de datos MySQL.
 * Crea tablas, aplica migraciones y siembra categorías globales.
 * Llamar UNA vez al arrancar el servidor, antes de app.listen().
 *
 * @returns {Promise<void>}
 * @throws {Error} Si la conexión a MySQL falla o una query es inválida.
 */
export const initializeDatabase = async () => {
    console.log("🗄️  Inicializando base de datos MySQL...");

    // 1. Crear tablas
    for (const sql of TABLES) {
        await pool.execute(sql);
    }
    console.log("✅ Tablas e índices creados/verificados");

    // 2. Sembrar categorías globales
    for (const cat of DEFAULT_CATEGORIES) {
        await pool.execute(
            `INSERT INTO categories (name, type, user_id)
       SELECT ?, ?, NULL FROM DUAL
       WHERE NOT EXISTS (
         SELECT 1 FROM categories WHERE name = ? AND type = ? AND user_id IS NULL
       )`,
            [cat.name, cat.type, cat.name, cat.type],
        );
    }
    console.log("✅ Categorías globales verificadas");
};
