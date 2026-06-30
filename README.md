# Fantacalcio Manager AI Zero

PWA gratuita per gestire una rosa fantacalcio durante la stagione.

## Cosa fa

- Gestione rosa con ruolo, squadra, costo, quotazione, stato e note.
- Dashboard con score rosa, budget residuo, rischi e consigli rapidi.
- Formazione per giornata con moduli classici e suggerimento automatico.
- Mercato/svincolati con priorità e offerta massima.
- Prompt IA generato automaticamente da copiare in ChatGPT.
- Backup esporta/importa JSON.
- Funziona su Android e iOS via browser.
- Nessuna API, nessun server, nessun costo obbligatorio.

## Come provarla sul PC

Apri `index.html` con il browser.

Nota: installazione PWA/offline e service worker funzionano meglio se pubblicata online o servita da localhost.

## Come pubblicarla gratis

Metodo semplice:

1. Crea un repository GitHub.
2. Carica tutti questi file nella root del repository.
3. Vai in Settings > Pages.
4. Source: Deploy from branch.
5. Branch: main / root.
6. Apri il link GitHub Pages da Android/iPhone.
7. Dal browser scegli "Aggiungi alla schermata Home".

Alternative gratuite: Netlify, Vercel, Cloudflare Pages.

## Uso consigliato

- Tu e il tuo amico potete usare lo stesso link.
- I dati restano salvati nel browser del singolo dispositivo.
- Per condividere la rosa: Dati > Esporta JSON, poi l'altro fa Importa JSON.
- Per usare l'IA: sezione IA > Copia prompt IA > incolla in ChatGPT.

## Limiti voluti

- Non scarica automaticamente infortuni/probabili formazioni da siti esterni.
- Non usa API IA a pagamento.
- Non ha login o database condiviso nella prima versione.

Questi limiti tengono il progetto gratuito, semplice e stabile.
