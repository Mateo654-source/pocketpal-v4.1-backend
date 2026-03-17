/**
 * @file src/config/db.js
 * @description Configuración del pool de conexiones MySQL con mysql2.
 *
 * Se usa un pool (grupo de conexiones) en lugar de una conexión única porque:
 *   1. Permite manejar múltiples peticiones concurrentes sin bloqueo.
 *   2. Reutiliza conexiones existentes en lugar de crear una nueva por petición.
 *   3. connectionLimit = 10 es suficiente para una aplicación de bajo/mediano tráfico.
 *
 * Opciones de configuración:
 *   - timezone: '+00:00' → almacena y lee fechas en UTC para evitar problemas de zona horaria.
 *   - typeCast: convierte automáticamente TINYINT(1) → boolean de JavaScript.
 *
 * Variables de entorno requeridas:
 *   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 */

import mysql from "mysql2/promise";
import "dotenv/config";

/**
 * Pool de conexiones MySQL.
 * Importar este objeto en los servicios para ejecutar queries.
 *
 * @example
 * import { pool } from '../config/db.js';
 * const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [userId]);
 */
export const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,

    // Configuración del pool
    waitForConnections: true, // esperar si no hay conexiones disponibles
    connectionLimit: 10, // máximo de conexiones simultáneas
    queueLimit: 0, // 0 = sin límite en la cola de espera

    // Almacenar y leer fechas en UTC (evita errores de zona horaria)
    timezone: "+00:00",

    /**
     * Convierte automáticamente TINYINT(1) (usado para boolean en MySQL)
     * a boolean de JavaScript para evitar comparaciones 0/1 en el código.
     * Otros tipos siguen el comportamiento estándar de mysql2.
     *
     * @param {object} field - Campo de la query result.
     * @param {Function} next - Función de conversión estándar.
     */
    typeCast: (field, next) => {
        if (field.type === "TINY" && field.length === 1) {
            return field.string() === "1";
        }
        return next();
    },
});

// Verificar la conexión al arrancar el servidor
pool.getConnection()
    .then((conn) => {
        console.log("✅ Conexión a MySQL establecida");
        conn.release(); // Devolver la conexión al pool
    })
    .catch((err) => {
        console.error("❌ Error conectando a MySQL:", err.message);
        process.exit(1); // Si no hay DB, el servidor no puede funcionar
    });
