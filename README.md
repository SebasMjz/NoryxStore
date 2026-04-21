# Noryx Store Admin

Panel de administración e inventario para Noryx Store.

## Requisitos previos

- [Node.js](https://nodejs.org/) (versión 18 o superior recomendada)
- npm (incluido con Node.js)

## Instalación

Abre la terminal en la raíz del proyecto y ejecuta el siguiente comando para instalar todas las dependencias necesarias:

```bash
npm install
```

## Configuración de Entorno

Antes de iniciar el proyecto, asegúrate de configurar las variables de entorno si es necesario (puedes basarte en el archivo `.env` que se encuentra en la raíz del proyecto).

## Cómo ejecutar el proyecto

Este proyecto cuenta con una API backend (servidor Node/Express) y un frontend (Astro/Astro-admin). Puedes correrlos simultáneamente o por separado:

### Ejecutar todo el proyecto (Frontend + API) - Recomendado

Para iniciar ambos servidores al mismo tiempo (el servidor de la API y el servidor del frontend):

```bash
npm run dev:full
```

### Ejecutar por partes (Opcional)

Si por alguna razón necesitas ejecutar las partes de forma separada:

1. **Solo el Frontend (Astro):**
   ```bash
   npm run dev
   ```

2. **Solo la API (Backend en modo desarrollo):**
   ```bash
   npm run api:dev
   ```
3. **Solo la API (Backend normal):**
   ```bash
   npm run api:start
   ```

## Otros Scripts Útiles

El proyecto cuenta con comandos adicionales para ayudarte en el desarrollo:

- `npm run build`: Construye el proyecto y genera los archivos finales para producción en la carpeta `dist`.
- `npm run lint`: Ejecuta herramientas de análisis (ESLint, Stylelint) para buscar errores en el código.
- `npm run fixlint`: Intenta corregir automáticamente los errores de sintaxis y estilos detectados por el linter.
- `npm run clean`: Limpia y elimina los archivos generados durante el desarrollo o la construcción (útil si hay problemas de caché).
