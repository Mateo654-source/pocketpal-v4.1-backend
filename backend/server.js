/**
 * @file server.js
 * @description Punto de entrada de la aplicación PocketPal Finance.
 *
 * Responsabilidades:
 *   1. Cargar variables de entorno desde .env (dotenv).
 *   2. Inicializar el esquema de base de datos (crear tablas si no existen).
 *   3. Arrancar el servidor HTTP en el puerto configurado.
 *
 * Si cualquier paso falla (DB no disponible, puerto en uso), el proceso
 * termina con exit(1) para que gestores de procesos como PM2 reinicien.
 *
 * Inicio del cron de sincronización de Gmail:
 *   Se importa startSyncCron() del jobs/syncCron.js y se llama después de
 *   que el servidor esté escuchando.
 */

import "dotenv/config"; // Cargar .env ANTES de cualquier otro import

import { app } from "./src/app.js";
import { initializeDatabase } from "./src/db/init.js";
import { startSyncCron } from "./src/jobs/syncCron.js";

const PORT = process.env.PORT || 3000;

/**
 * Arranca la aplicación:
 *   1. Inicializa la base de datos (tablas + categorías por defecto).
 *   2. Inicia el servidor HTTP.
 *   3. Inicia el cron job de sincronización de Gmail.
 *
 * @returns {Promise<void>}
 */
const startServer = async () => {
    try {
        // Paso 1: Crear tablas e índices si no existen
        console.log("Inicializando base de datos...");
        await initializeDatabase();
        console.log("Base de datos inicializada correctamente");

        // Paso 2: Iniciar servidor HTTP
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Servidor corriendo en: ${PORT}`);
            console.log(`🌍 Entorno: ${process.env.NODE_ENV || "development"}`);
        });

        // Paso 3: Iniciar cron de sincronización de Gmail (cada hora)
        startSyncCron();
    } catch (error) {
        console.error("❌ Error al arrancar el servidor:", error);
        // exit(1) para que PM2 / Docker reinicie el proceso automáticamente
        process.exit(1);
    }
};

startServer();
