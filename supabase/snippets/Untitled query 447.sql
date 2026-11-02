-- select count(*) from public.events where image_url like 'http://192.168.2.63:54321/%';

update public.events
set image_url = replace(image_url, 'http://192.168.2.63:54321', 'http://192.168.100.57:54321')
where image_url like 'http://192.168.2.63:54321/%';