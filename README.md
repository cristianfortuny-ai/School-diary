# School Diary

Una aplicación web de comunidad escolar con feed de memes, likes, descargas, estados que caducan a las 24 horas, chats privados y panel de administración. No usa Firebase.

## Requisitos

- Node.js 20 o superior
- PostgreSQL 14 o superior
- Un proyecto OAuth de Google (opcional, solo si quieres el botón de Google)

## Ejecutar localmente

1. Crea una base de datos y un usuario de PostgreSQL. Por ejemplo, desde `psql` como administrador:

   ```sql
   CREATE USER school_diary_user WITH PASSWORD 'cambia_esta_contraseña';
   CREATE DATABASE school_diary OWNER school_diary_user;
   ```

2. Copia `.env.example` a `.env` y configura `DATABASE_URL` y `SESSION_SECRET`. Usa un secreto aleatorio largo. No subas `.env` a GitHub.

   ```bash
   cp .env.example .env
   ```

3. Instala dependencias:

   ```bash
   npm install
   ```

4. Crea las tablas:

   ```bash
   npm run db:init
   ```

5. Arranca el servidor:

   ```bash
   npm run dev
   ```

6. Abre `http://localhost:3000`.

## Activar Google OAuth

1. En Google Cloud Console crea o selecciona un proyecto.
2. Configura la pantalla de consentimiento OAuth y añade los usuarios de prueba necesarios.
3. Crea un cliente OAuth de tipo **Aplicación web**.
4. En orígenes autorizados añade `http://localhost:3000`.
5. En URI de redirección autorizados añade `http://localhost:3000/api/auth/google/callback`.
6. Copia el Client ID y Client Secret a `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en `.env`.
7. Reinicia el servidor.

Para producción, añade también tu dominio real en orígenes autorizados y la URL exacta `https://TU-DOMINIO/api/auth/google/callback` en las URI de redirección. Actualiza `BASE_URL` a `https://TU-DOMINIO`.

## Crear el primer administrador

1. Registra una cuenta desde la web, usando el correo que quieres que sea administrador.
2. Ejecuta:

   ```bash
   npm run admin:create -- tu-correo@ejemplo.com
   ```

3. Cierra sesión y vuelve a entrar para refrescar los permisos de la sesión.

No expongas este comando a usuarios normales. El rol se cambia directamente en PostgreSQL desde un entorno controlado.

## Despliegue

GitHub guarda el código; **no basta con GitHub Pages** para esta app porque necesita un servidor Node.js y PostgreSQL. Despliega el proyecto en un proveedor que soporte Node.js y una base de datos PostgreSQL.

Configura estas variables en el proveedor:

- `NODE_ENV=production`
- `BASE_URL=https://tu-dominio`
- `DATABASE_URL=...` (cadena privada de PostgreSQL)
- `SESSION_SECRET=...` (secreto largo, único)
- `GOOGLE_CLIENT_ID=...`
- `GOOGLE_CLIENT_SECRET=...`
- `UPLOAD_DIR=uploads` solo si el disco es persistente

Ejecuta `npm install` y `npm run db:init` una vez contra la base de datos de producción. Usa HTTPS. Si el proveedor no ofrece disco persistente, **no guardes subidas en `uploads/`**: conecta almacenamiento de objetos persistente y cambia el código de subida para usarlo.

## Funciones incluidas

- Registro con correo/contraseña (contraseñas con bcrypt) e inicio de sesión.
- Inicio de sesión con Google OAuth.
- Feed de publicaciones con imágenes/vídeos, likes, descargas y eliminación autorizada.
- Estados con caducidad de 24 horas.
- Conversaciones privadas de dos personas y mensajes guardados en PostgreSQL.
- Panel de administración para suspender/reactivar cuentas y cambiar roles.
- Sesiones guardadas en PostgreSQL, limitación básica de intentos de autenticación y cabeceras de seguridad.

## Importante antes de publicarlo

Este es un punto de partida funcional, no una auditoría de seguridad ni una plataforma lista para una comunidad escolar real. Antes de abrir registros al público, añade verificación de correo, recuperación de contraseña, protección CSRF revisada para tu despliegue, límites de abuso por usuario, moderación/reportes, política de privacidad, borrado/exportación de datos y copias de seguridad. Si lo usarán menores, pide autorización del centro y aplica sus reglas de privacidad. No publiques datos personales ni fotos de estudiantes sin permiso.

Los estados caducan en las consultas tras 24 horas; este starter no elimina automáticamente los archivos caducados. Añade una tarea programada de limpieza para producción.
