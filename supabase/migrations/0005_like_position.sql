-- Likes bekommen eine Stelle im Video: wo man die Fahrt geliked hat (Sekunden im Video).
-- Die Karte zeigt dort das Peace-Symbol auf der Route. Ältere Likes (und Likes ohne laufendes
-- Video, z. B. aus dem Dashboard) haben keine Stelle – null.
alter table public.likes add column if not exists seconds real;
