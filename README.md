# FilBackupStatusSwa - Azure Static Web Apps-version

Samme funktion som `FilBackupStatusServer`, men bygget til Azure Static Web
Apps: Azure Functions (isolated worker, .NET 8) i stedet for en almindelig
ASP.NET Core-app, Table Storage i stedet for lokale JSON-filer, og Azure
Communication Services Email i stedet for SMTP.

## Mappestruktur

| Mappe/fil | Formål |
|---|---|
| `app/` | Minimal statisk placeholder-side (SWA kræver en app-mappe) |
| `api/` | Selve Azure Functions-koden |
| `staticwebapp.config.json` | Routing-konfiguration for SWA |

## Dashboard

`app/index.html` er et statusdashboard, ikke længere kun en placeholder. Det
kalder `/api/status` (samme origin som selve SWA'en, så ingen CORS-opsætning
nødvendig) og viser seneste rapport pr. kunde som farvede kort - rødt ved
"fejl" i emnet, gult ved "ingen ny backup", grønt ellers.

**Om API-nøglen på dashboardet:** siden beder om jeres `ApiKey` første gang I
åbner den, og gemmer den kun i browserens `sessionStorage` (ryddes når fanen
lukkes) - den ligger aldrig i selve koden eller filen. Alle med nøglen kan se
dashboardet, præcis som alle med nøglen allerede kunne kalde `/api/status`
direkte - dashboardet ændrer ikke ved hvem der kan se hvad, det gør det bare
læsbart i en browser i stedet for rå JSON.

## Endpoints

Samme som App Service-versionen:

| Endpoint | Formål |
|---|---|
| `POST /api/report` | Kaldes af kunde-PC'erne. Header `X-Api-Key`, JSON-body `{customerName, movexNumber, subject, body}`. |
| `GET /api/status` | Seneste rapport pr. kunde (samme `X-Api-Key`) - bruges nu af dashboardet i `app/`. |

Der er ingen `/health`-endpoint i denne version - Azure Functions har sin
egen indbyggede overvågning via Application Insights (se nedenfor).

## Forudsætninger i Azure (opsæt i denne rækkefølge)

1. **Storage Account** - almindelig Azure Storage Account, bruges til Table
   Storage. Kan være samme, som SWA evt. opretter automatisk, eller jeres eget.
2. **Azure Communication Services**-ressource, med en **Email**-tjeneste
   tilknyttet. Under opsætningen skal I enten:
   - bruge Azures eget testdomæne (`*.azurecomm.net`) - virker med det samme,
     godt til test, men mails kan lande i spam hos modtageren, eller
   - verificere jeres eget domæne (kræver DNS-records) - anbefales til
     produktion.
3. **Static Web App**-ressourcen selv, med `api/`-mappen tilknyttet som
   "Managed Functions".

## Managed Identity - vigtigt forbehold

Planen var at bruge Managed Identity, så der slet ingen hemmelighed skal
gemmes for at få adgang til Table Storage og ACS Email. Det kræver at jeres
SWA-niveau/Function-integration understøtter en system-tildelt identitet på
den måde, en almindelig separat Azure Function App gør. **Jeg kan ikke
bekræfte fra her, om det er tilfældet for netop jeres SWA-niveau** - det kan
have ændret sig, og jeg har ikke adgang til at slå det op live.

Sådan finder I ud af det, og hvad I gør i hvert tilfælde:

- **Hvis Managed Identity kan slås til** på jeres SWA-ressource (under
  **Identity** i Azure-portalen): giv den identitet rollen **Storage Table
  Data Contributor** på jeres Storage Account, og rollen **Communication and
  Email Service Owner** (eller en mere afgrænset custom-rolle, hvis I vil
  være strammere) på ACS-ressourcen. Sæt kun `AcsEndpoint`
  (ACS-ressourcens URL) som app-setting - **lad `AcsConnectionString` stå
  tom**. Koden bruger så `DefaultAzureCredential` automatisk.
- **Hvis Managed Identity ikke er en mulighed**: sæt `AcsConnectionString`
  som app-setting i stedet (findes under ACS-ressourcen -> Keys). Det er
  stadig krypteret af Azure i Application Settings, bare ikke helt
  hemmeligheds-frit. Funktionelt uændret i forhold til App Service-versionen.

I begge tilfælde skal `AzureWebJobsStorage` (forbindelsen til jeres Storage
Account til selve Table Storage) sættes som app-setting - Functions kræver
den under alle omstændigheder for sin egen drift, uafhængigt af Managed
Identity-spørgsmålet ovenfor.

## Lokal udvikling

1. Installer [Azure Functions Core Tools](https://learn.microsoft.com/azure/azure-functions/functions-run-local) og .NET 8 SDK.
2. Udfyld `api/local.settings.json` (denne fil deployes ALDRIG, kun til lokal brug):
   - `AzureWebJobsStorage`: enten `UseDevelopmentStorage=true` (kræver
     [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite)
     kørende lokalt) eller en rigtig (gerne test-)Storage Account connection string.
   - `ApiKey`: en genereret nøgle, samme som klienten skal bruge.
   - `AcsConnectionString`: nemmest til lokal test - virker uden Managed
     Identity-opsætning. Alternativt, hvis I er logget ind med `az login` og
     vil teste selve Managed Identity-flowet, sæt kun `AcsEndpoint` -
     `DefaultAzureCredential` finder automatisk jeres CLI-login lokalt.
3. Kør fra `api/`-mappen:
   ```
   func start
   ```
   API'et kører herefter typisk på `http://localhost:7071/api/report` osv.

## Deployment

Nemmest via GitHub Actions, som SWA opsætter automatisk, når I opretter
ressourcen og peger den på jeres repository - angiv `app_location: "app"` og
`api_location: "api"` i den workflow-fil, Azure genererer. Alternativt kan I
bruge SWA CLI (`swa deploy`) til manuel deployment uden GitHub.

## Overvågning

Da der ikke er noget `/health`-endpoint her (Azure Functions overvåges
anderledes end en almindelig webapp), brug i stedet **Application Insights**
(kan tilknyttes SWA/Functions-ressourcen) til at holde øje med fejl og om
`EmailRetry`-funktionen rent faktisk kører som planlagt hvert 10. minut. Sæt
en alarmregel op på fejlrater eller manglende kørsler, så I stadig får besked
udefra, hvis noget går galt med selve tjenesten.

## Hvordan det virker

1. Kunde-PC'en poster `{customerName, movexNumber, subject, body}` til
   `/api/report` med sin `X-Api-Key`.
2. `ReportFunction` gemmer rapporten i Table Storage (`Reports`-tabellen,
   partition pr. kunde, samt `LatestStatus`-tabellen med kun seneste pr.
   kunde) - *før* den forsøger at sende mail. Rapporten går altså ikke tabt,
   selvom selve mailafsendelsen fejler.
3. Mailen forsøges sendt med det samme via Azure Communication Services.
   Lykkes det ikke, lægges den i `PendingEmails`-tabellen.
4. `EmailRetryFunction` kører hvert 10. minut og forsøger at sende alt, der
   stadig ligger i køen.
