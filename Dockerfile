# TuxOS is a static site: nginx serves it as-is.
FROM nginx:alpine

COPY . /usr/share/nginx/html

EXPOSE 80
