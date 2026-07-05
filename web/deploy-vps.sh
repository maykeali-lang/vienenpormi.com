#!/usr/bin/env bash
# ============================================================================
#  Instalador para el VPS — Vienen por mi (www.vienenpormi.com)
#  Uso:  subir y descomprimir el zip de la carpeta `web`, entrar a ella y:
#        bash deploy-vps.sh
#  Requiere sudo. Edita EMAIL antes de correr (para el certificado HTTPS).
# ============================================================================
set -e

DOMAIN="vienenpormi.com"
APPDIR="/var/www/vienenpormi"
EMAIL="TU_CORREO@ejemplo.com"   # <-- cámbialo (Let's Encrypt)

echo ">> 1/5  Instalando Node.js 20, nginx y certbot…"
sudo apt-get update -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx certbot python3-certbot-nginx

echo ">> 2/5  Compilando la web (npm install + build)…"
npm install
npm run build      # genera ./dist

echo ">> 3/6  Publicando en $APPDIR …"
sudo mkdir -p "$APPDIR"
sudo rm -rf "$APPDIR/dist"
sudo cp -r dist "$APPDIR/dist"
# backend del contador de reproducciones (servicio Node)
sudo mkdir -p "$APPDIR/server"
sudo cp -r server/plays-server.mjs "$APPDIR/server/"

echo ">> 4/6  Instalando el contador global (systemd: vpm-plays)…"
sudo install -d -o www-data -g www-data /var/lib/vpm-plays
sudo cp server/vpm-plays.service /etc/systemd/system/vpm-plays.service
sudo systemctl daemon-reload
sudo systemctl enable --now vpm-plays
sudo systemctl restart vpm-plays
# comprobacion rapida
sleep 1
curl -fsS http://127.0.0.1:8787/api/health && echo "  (contador OK)" || echo "  (revisa: journalctl -u vpm-plays -e)"

echo ">> 5/6  Configurando nginx…"
sudo tee /etc/nginx/sites-available/vienenpormi >/dev/null <<'NGINX'
server {
    listen 80;
    server_name vienenpormi.com www.vienenpormi.com;
    root /var/www/vienenpormi/dist;
    index index.html;

    location / { try_files $uri $uri/ /index.html; }

    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # contador global de reproducciones -> servicio Node local
    location /api/ {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    types { audio/ogg ogg; audio/mpeg mp3; application/json json; }
    client_max_body_size 20m;
}
NGINX
sudo ln -sf /etc/nginx/sites-available/vienenpormi /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

echo ">> 6/6  HTTPS con Let's Encrypt…"
sudo certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" \
  --non-interactive --agree-tos -m "$EMAIL" --redirect \
  || echo "   (Si falla, corre: sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN)"

echo ""
echo "==========================================================="
echo "  LISTO  ->  https://www.vienenpormi.com"
echo "  (si el DNS recién apunta, espera unos minutos)"
echo "==========================================================="
