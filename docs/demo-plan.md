PS C:\semetri_VI\web app> npm run dev

> dev
> node --watch habitCooach.js

MongoDB connection error: querySrv ECONNREFUSED _mongodb._tcp.cluster0.9dot3pp.mongodb.net
Failed running 'habitCooach.js'. Waiting for file changes before restarting...# Demo Plan (5-7 min) - HabitCoachAI

## 1) Cka eshte projekti dhe kujt i sherben (45-60 sek)
HabitCoachAI eshte nje aplikacion MERN per menaxhim zakonesh ditore, me fokus te vecante ne:
- planifikim ditor/javor te zakoneve
- ndjekje progresi me status `pending/completed/missed`
- asistence nga AI chat per motivim dhe ide praktike

I sherben studenteve dhe personave qe duan te krijojne rutine me disipline, duke pasur nje panel te qarte dhe raportim progresi.

## 2) Flow kryesor qe do demonstroj (3-4 min)
1. Login ne aplikacion me user demo.
2. Dashboard:
   - shfaq Daily Agenda
   - shtoj nje zakon te ri (title + description).
3. Planning:
   - Date Navigator (`date picker`, Back to Today)
   - Time Blocking (Morning/Afternoon/Evening)
   - markoj nje zakon `Done` dhe pastaj `Undo`.
4. Weekly Architect:
   - tregoj renditjen Yesterday/Today/Tomorrow
   - shpjegoj se ditet tjera shihen me scroll.
5. Progress:
   - hap chart-et dhe trendin javor/mujor.
6. Duos & Global Pulse:
   - tregoj invite per nje Duo Partner me email.
   - shpjegoj Pending Invitations dhe Duo Shared Habits me progres side-by-side.
   - tregoj Global Habit Pulse me completion today, fitness goals, dhe streak freezes.
7. AI Chat:
   - dergoj nje prompt te shkurter dhe tregoj pergjigjen.

## 3) Cilat pjese teknike do t'i shpjegoj shkurt (60-90 sek)
- Arkitektura MERN:
  - Frontend: `public/index.html`, `public/script.js`
  - Backend: `Express` routes + middleware auth
  - DB: `MongoDB` me `Mongoose`
- Auth & Security:
  - JWT Bearer token
  - endpoint-e te mbrojtura per habits/chat/progress
- Habit history:
  - status per date ne format `YYYY-MM-DD`
  - UI read-only per data historike (jo update ne dite te kaluara)
- Duos & Global Pulse:
  - endpoint-e te mbrojtura `/api/social/shared-habits`, `/invite`, `/accept`, `/decline`
  - agregim anonim komunitar nga history/frequency, i llogaritur sipas timezone te user-it
- Ndarja e sjelljes se delete:
  - Daily Agenda = permanent delete ne DB (`DELETE /api/habits/:id`)
  - Planning Time Blocking = UI-only hide (pa prekur DB)

## 4) Cfare kam kontrolluar para demos (Pre-demo checklist)
- [ ] Serveri nis pa error (`npm run dev`)
- [ ] `.env` ka vlera valide (`MONGO_URI`, `JWT_SECRET`, `AI_API_KEY`, email vars nese duhen)
- [ ] Login/Register funksionon
- [ ] CRUD i habit-eve funksionon
- [ ] Time Blocking update (`PUT /api/habits/:id`) funksionon
- [ ] Progress endpoint-et ngarkojne te dhenat
- [ ] Social dashboard ngarkon Duos, Pending Invitations dhe Global Pulse
- [ ] Invite/Accept/Decline per Duo funksionon me dy user-a demo
- [ ] AI Chat pergjigjet brenda timeout-it
- [ ] Live URL hapet ne browser pa gabime kritike
- [ ] Kontrolluar nje user demo me data te gatshme

## 5) Plan B nese live demo deshton (45-60 sek)
Nese live URL ose interneti deshton:
1. Kaloj ne demo lokale (`npm run dev`) me te njejtin user demo.
2. Hap screenshot/video fallback te flow-it kryesor (login -> planning -> progress -> chat).
3. Demonstroj endpoint-et me shembuj te shkurter dhe shpjegoj rezultatet e pritura.
4. Theksoj se funksionaliteti eshte testuar paraprakisht me checklist.

## 6) Mesazhi final (15-20 sek)
Vlera e HabitCoachAI eshte kombinimi i:
- planifikimit praktik te zakoneve
- monitorimit te qarte te progresit
- asistences AI ne nje workflow te vetem dhe te thjeshte per perdoruesin.
