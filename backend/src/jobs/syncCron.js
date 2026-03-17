/**
 * @file src/jobs/syncCron.js
 * @description Cron job de sincronización automática de transacciones desde Gmail.
 *
 * Se ejecuta cada hora y procesa todos los usuarios que tienen un
 * `google_access_token` guardado en la base de datos.
 *
 * Se inicia una sola vez al arrancar el servidor (desde app.js mediante `startSyncCron()`).
 * Los errores individuales de cada usuario NO detienen el cron — se loguean y se continúa.
 */

import cron from "node-cron";
import { pool } from "../config/db.js";
import { syncAutomatic } from "../controllers/gmailController.js";

/**
 * Inicia el cron job de sincronización automática.
 * Corre cada hora en el minuto 0 (expresión cron: "0 * * * *").
 *
 * Por cada usuario con token de Google:
 *   1. Llama a syncAutomatic(userId).
 *   2. Los errores de usuarios individuales son capturados en gmailController.
 *
 * @returns {void}
 */
export const startSyncCron = () => {
    cron.schedule("0 * * * *", async () => {
        console.log(
            "🔄 Iniciando sync automático de Gmail para todos los usuarios...",
        );

        // Obtener IDs de usuarios con token de Google activo
        const [users] = await pool.execute(
            "SELECT id FROM users WHERE google_access_token IS NOT NULL",
        );

        console.log(`   → ${users.length} usuarios con token de Google`);

        // Procesar usuarios secuencialmente para no saturar la API de Google
        for (const user of users) {
            await syncAutomatic(user.id);
        }

        console.log("✅ Sync automático completado");
    });

    console.log(
        "⏰ Cron de sincronización Gmail iniciado (cada hora en el minuto :00)",
    );
};
