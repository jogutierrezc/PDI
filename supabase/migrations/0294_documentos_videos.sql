-- Documentos · videos .mp4 / .webm.
--
-- El bucket «documentos» (0051) limitaba cada archivo a 50 MB. Un video pesa más,
-- así que el tope del bucket sube a 500 MB. El asistente de publicación sigue
-- exigiendo 50 MB a todo lo que no sea video (MAX_DOC_BYTES) y 500 MB a los videos
-- (MAX_VIDEO_BYTES, en src/modules/admin/documentos/store.ts).
--
-- OJO: el tope del bucket no basta. Storage también tiene un límite global
-- (variable FILE_SIZE_LIMIT del contenedor storage, 50 MB por defecto) y el proxy
-- de entrada tiene el suyo (client_max_body_size en nginx, o equivalente). Los
-- tres tienen que permitir 500 MB; el menor manda.

update storage.buckets
   set file_size_limit = 524288000   -- 500 MB
 where id = 'documentos';
