show databases;
use proyecto_;

show tables;


-- Script de modificación y consulta de de usuarios

select * from users;
select * from users where id = 6;
delete from users where id = 7;

SELECT id, name, email, google_id, avatar FROM users;

ALTER TABLE users 
ADD COLUMN google_access_token TEXT NULL,
ADD COLUMN google_refresh_token TEXT NULL;

SELECT sum(t.amount) as "Total gastado" FROM transactions t where user_id = 8;
SELECT * FROM transactions t where user_id = 8;
DELETE FROM transactions t where user_id = 8;

SELECT id, type, description, amount, date, gmail_message_id 
FROM transactions 
WHERE user_id = 8 
AND type = 'income'
ORDER BY date DESC;

ALTER TABLE transactions 
MODIFY COLUMN merchant TEXT;

ALTER TABLE transactions 
MODIFY COLUMN description TEXT;


-- Modificación y consultas de las transacciones
delete FROM transactions t where user_id = 9;


ALTER TABLE transactions 
ADD COLUMN gmail_message_id VARCHAR(255) UNIQUE NULL;

ALTER TABLE transactions 
ADD COLUMN merchant VARCHAR(255) NULL,
ADD COLUMN bank VARCHAR(100) NULL;

SELECT * FROM transactions;
ALTER TABLE transactions 
MODIFY COLUMN category_id INT NULL DEFAULT NULL;


-- Modificación y consultas de las metas
select * from goals;

DESCRIBE goals;

ALTER TABLE goals 
MODIFY COLUMN title INT NULL DEFAULT NULL;

SHOW INDEX FROM goals;

ALTER TABLE goals
DROP INDEX title;

-- Agregar campo de decisión final a goals
ALTER TABLE goals 
ADD COLUMN completion_type ENUM('expense', 'saving') NULL DEFAULT NULL;
