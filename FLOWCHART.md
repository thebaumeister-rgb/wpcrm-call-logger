# WPCRM Call Logger workflow

```mermaid
flowchart TD
    A[Install from HTTPS website] --> B[Open phone app]
    B --> C{Type or voice?}
    C --> D[Enter contact, optional additional contacts, subject, type, date/time and notes]
    C --> E[Answer spoken questions]
    E --> D
    D --> F{Meeting?}
    F -- Yes --> G[Enter mileage]
    F -- No --> H[Review details and optional actions]
    G --> H
    H --> I[Save locally on phone]
    I --> J[Review or edit saved calls]
    J --> K[Share or export timestamped JSON]
    K --> L[Transfer to office PC through OneDrive or another approved method]
    L --> M[Search WPCRM contact]
    M --> N{One confirmed match?}
    N -- No --> O[Ask user to choose or skip]
    O --> M
    N -- Yes --> P[Add completed appointment with exported details]
    P --> Q[Verify WPCRM save and track record ID]
```

The phone app records and exports calls. WPCRM entry is a separate, supervised browser workflow. No automatic CRM upload or OneDrive connection is included.

Voice: a missing response gets one retry, then stops with the form retained. Stop cancels speech/listening. Notes collect multiple final speech segments until a 3.5-second pause or a 60-second limit. Unrecognized dates require manual correction.

Backup recovery: Import JSON validates the full file, merges new record IDs, and keeps the local version of existing IDs. Importing does not change WPCRM.
