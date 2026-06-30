# Fantacalcio Rosa Live V3

PWA personale per gestire solo la propria rosa fantacalcio durante la stagione.

## Obiettivo

Non è un gestionale lega e non è un tool asta. Serve per:

- inserire manualmente la propria rosa personale;
- importare velocemente la rosa da testo o CSV;
- seguire la giornata corrente;
- marcare status live: OK, dubbio, ballottaggio, infortunato, squalificato, non convocato;
- incollare news/probabili formazioni e applicare aggiornamenti ai giocatori trovati;
- generare una formazione suggerita con regole locali;
- copiare un prompt già strutturato per ChatGPT;
- salvare backup JSON.

## Costi

Zero: nessuna API, nessun backend, nessun login.

## Import rosa rapida

Formato consigliato:

```csv
Ruolo;Nome;Squadra;Costo;Quotazione;Note
P;Sommer;Inter;12;18;Portiere titolare
D;Dimarco;Inter;42;25;Top difesa
C;Orsolini;Bologna;32;24;Bonus
A;Lautaro Martinez;Inter;105;40;Top attacco
```

Sono accettati anche CSV con colonne diverse se contengono almeno nome e ruolo. L'app prova a riconoscere colonne come Nome/Calciatore, Ruolo, Squadra/Team, Costo/Prezzo, Quotazione, Note.

## Uso GitHub Pages

Caricare questi file nella root del repository GitHub Pages:

- index.html
- style.css
- app.js
- manifest.webmanifest
- sw.js
- icon-192.png
- icon-512.png
- README.md

I dati restano nel browser del dispositivo. Per copiarli su altro telefono usare Esporta JSON / Importa JSON.
