# Moveact 管理画面（admin / Vite SPA）の本番ビルド
# Coolify: base_directory=/admin, build_pack=dockerfile で利用。
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Supabase 公開設定（anon key は RLS 前提の公開キー。web-booking 配信物にも既出）
ENV VITE_SUPABASE_URL=https://khsriogicdjdyivshplc.supabase.co
ENV VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtoc3Jpb2dpY2RqZHlpdnNocGxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3OTA2NzgsImV4cCI6MjA5MDM2NjY3OH0.1sDRNML0QqvQW1j2dIoJZdjV2NfFPQr4tYWxGC9gOCc
RUN npm run build

FROM nginx:alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
COPY <<'EOF' /etc/nginx/conf.d/default.conf
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
