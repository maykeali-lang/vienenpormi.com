# Deploy a VPS (cuando esté listo)

El sitio es 100% estático: se compila a `dist/` y se sirve con nginx. No hace
falta Node en el servidor.

## 1. Compilar en tu PC
```bash
cd web
npm run build        # genera dist/ (~15 MB con el audio)
```

## 2. Subir dist/ al servidor (rsync por SSH)
```bash
rsync -avz --delete dist/ usuario@TU_IP:/var/www/vienenpormi/
```
(o scp -r dist/* usuario@TU_IP:/var/www/vienenpormi/)

## 3. nginx — bloque de servidor
`/etc/nginx/sites-available/vienenpormi`:
```nginx
server {
    listen 80;
    server_name vienenpormi.com www.vienenpormi.com;   # tu dominio
    root /var/www/vienenpormi;
    index index.html;

    # SPA: todo cae en index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache largo para assets con hash (js/css/audio)
    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Asegurar MIME correcto del audio
    types { audio/ogg ogg; audio/mpeg mp3; application/json json; }
}
```
Activar:
```bash
sudo ln -s /etc/nginx/sites-available/vienenpormi /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 4. Apuntar el dominio (DNS)
En tu registrador: registro A de `vienenpormi.com` -> IP del VPS
(y otro A o CNAME para `www`).

## 5. HTTPS gratis (Let's Encrypt)
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d vienenpormi.com -d www.vienenpormi.com
```

## Nota sobre la ruta (base)
- Si va en la RAÍZ del dominio: en `vite.config.ts` pon `base: "/"`.
- Si va en una SUBCARPETA (dominio.com/banda): deja `base: "./"` (actual).
Recompila tras cambiarlo.

## Checklist
- [ ] `npm run build` sin errores
- [ ] dist/ subido a /var/www/vienenpormi
- [ ] nginx -t OK y reload
- [ ] DNS apuntando a la IP
- [ ] certbot -> https funcionando
- [ ] Probar en móvil (downgrade automático activo)
