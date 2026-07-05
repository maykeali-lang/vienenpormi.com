# Desplegar "Vienen por mi" — GitHub → VPS (www.vienenpormi.com)

VPS: `194.238.30.26` · Dominio: `www.vienenpormi.com` (DNS ya apunta) · SSH: MobaXterm.

> IMPORTANTE: ejecuta la PARTE 1 **desde tu PC** (en la carpeta `web`), no desde
> el agente. El sandbox del agente ve copias en la nube de OneDrive y podría
> subir archivos incompletos. En tu PC los archivos están completos.

El proyecto compila con `npm run build` (solo Vite). `node_modules`, `dist` y
`audio_raw` están en `.gitignore`; los assets que SÍ se suben son
`public/assets/songs/libreta/{envelopes.json, mixdown.mp3, mixdown.ogg}`.

---

## PARTE 1 — Subir a GitHub (desde tu PC)

1. Crea un repositorio vacío en https://github.com/new (ej. `vienen-por-mi`), sin README.
2. Abre una terminal (Git Bash / PowerShell / MobaXterm local) en la carpeta `web`:

```bash
cd "C:/Users/gigaw/OneDrive/Desktop/Voltanet work/vienen por mi/web"
git init
git add .
git commit -m "Vienen por mi — experiencia web (Libreta)"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/vienen-por-mi.git
git push -u origin main
```

(Si pide login, usa tu usuario + un Personal Access Token de GitHub como contraseña.)

---

## PARTE 2 — En el VPS (MobaXterm → SSH a 194.238.30.26)

### 2.1 Dependencias (una sola vez)
```bash
sudo apt update
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git nginx
```

### 2.2 Clonar y construir
```bash
cd /var/www
sudo git clone https://github.com/TU_USUARIO/vienen-por-mi.git vienenpormi
cd vienenpormi/web
sudo npm install
sudo npm run build        # genera /var/www/vienenpormi/web/dist
```

### 2.3 Nginx
Crea `/etc/nginx/sites-available/vienenpormi`:
```nginx
server {
    listen 80;
    server_name vienenpormi.com www.vienenpormi.com;
    root /var/www/vienenpormi/web/dist;
    index index.html;

    location / { try_files $uri $uri/ /index.html; }

    # cache largo para assets con hash (js/css/audio)
    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # MIME correcto del audio
    types { audio/ogg ogg; audio/mpeg mp3; application/json json; }

    client_max_body_size 20m;
}
```
Activar:
```bash
sudo ln -s /etc/nginx/sites-available/vienenpormi /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 2.4 HTTPS (Let's Encrypt)
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d vienenpormi.com -d www.vienenpormi.com
```

Ya debería verse en https://www.vienenpormi.com

---

## Actualizar la web (cada vez que cambies algo)
En tu PC: `git add . && git commit -m "..." && git push`
En el VPS:
```bash
cd /var/www/vienenpormi && sudo git pull && cd web && sudo npm install && sudo npm run build
```
(no hace falta tocar nginx; sirve la carpeta `dist` actualizada)

## Notas
- El audio pesa ~14 MB (mp3+ogg+json). Si el primer load es lento, considera
  `gzip on;` en nginx (no comprime mp3/ogg pero sí el JS/JSON).
- Si quieres servirlo en una subcarpeta en vez de la raíz, cambia
  `base` en `vite.config.ts` y recompila.
