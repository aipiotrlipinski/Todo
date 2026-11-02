# Plan – notatki do dalszej pracy

Osobista aplikacja do zadań Piotra (zastępuje płatny Todoist). Specyfikacja:
https://claude.ai/artifact/8ER5bzwtfwzpLSv4JSEmMp · makiety wyglądu:
https://claude.ai/artifact/AVxDjANrVdNcw4Qed5vDbj

## Zasada pracy
Źródłem prawdy jest repozytorium GitHub **aipiotrlipinski/Todo** (gałąź `main`).
Nie pisać od nowa — sklonować repo, poprawić tylko to, o co prosi Piotr, sprawdzić
testy i build, zrobić commit i push na `main`. GitHub Actions samo publikuje aplikację na
**https://aipiotrlipinski.github.io/Todo/**. Po każdej zmianie zaktualizować sekcję „Stan”.
Kopia na komputerze Piotra: `[App] Todo\kod-zrodlowy` + `[App] Todo\Plan.html` (wersja offline).
Uwaga: wersja z GitHub Pages i Plan.html mają osobne dane (inny adres w przeglądarce);
przenoszenie przez Ustawienia → kopia JSON.

## Jak wznowić w nowej sesji
1. Sklonować repo aipiotrlipinski/Todo (albo skopiować `kod-zrodlowy` z komputera).
2. `npm install`
3. `npm test` (parser + powtarzanie) i `npx tsc --noEmit -p .`
4. `npx vite build` → `dist/index.html` (jeden plik, wszystko wbudowane)
5. Commit + push na `main` (publikacja automatyczna). Opcjonalnie skopiować `dist/index.html` jako `[App] Todo\Plan.html`.

## Aplikacja na Androida (APK)
- Capacitor 7 (`capacitor.config.ts`, folder `android/`), appId `pl.lipinski.plan`, nazwa „Plan”.
- Workflow `.github/workflows/apk.yml` przy każdym pushu buduje APK i publikuje je jako wydanie.
  Stały link: https://github.com/aipiotrlipinski/Todo/releases/latest/download/Plan.apk
- Podpis: `android/app/plan.keystore` (hasło w `android/app/build.gradle`). Nie zmieniać —
  inny klucz = telefon nie zainstaluje aktualizacji bez odinstalowania (utrata danych).
- versionCode = numer uruchomienia workflow, więc nowa wersja zawsze instaluje się na starą.
- Ikony/splash wygenerowane z favicony (fiolet #6D4AFF + ptaszek) w `android/app/src/main/res`.
- Telefon ma własne dane (osobna baza); przenoszenie przez Ustawienia → kopia JSON.

## Decyzje (ustalone z Piotrem)
- Jedna osoba, PC, aplikacja w przeglądarce, dane lokalnie (IndexedDB przez Dexie).
- Otwierana dwuklikiem z pliku (vite-plugin-singlefile), bez serwera.
- Wygląd: na PC karty z wersji 3, na telefonie (≤860px) płasko jak w Todoist; ciemny motyw z wersji 2; czcionka Plus Jakarta Sans
  (wbudowana), akcent #6D4AFF jasny / #A594FF ciemny, panele radius 20, wiersze 14.
- Motyw: domyślnie z systemu, przełącznik w menu zapamiętuje wybór (localStorage `plan.theme`).
- Planista: najpierw algorytm (bez AI), AI później.
- Zadania powtarzalne i podzadania są w MVP.
- Styl: zwykły CSS ze zmiennymi (`src/styles.css`), bez Tailwinda.

## Struktura
- `src/types.ts` – model: Task, Project, Stage, Label, SavedFilter, Block, Setting, View
- `src/db.ts` – schemat Dexie (baza `plan`, wersja 2: projects.parentId). Zmiana schematu = kolejna `this.version(n)` z `upgrade`.
- `src/parser.ts` – szybkie dodawanie po polsku (testy w `parser.test.ts`)
- `src/recurrence.ts` – powtarzanie (pierwsze/następne wystąpienie, opis)
- `src/dates.ts` – daty lokalne 'YYYY-MM-DD', formatowanie po polsku
- `src/actions.ts` – wszystkie zapisy do bazy, eksport/import kopii
- `src/selectors.ts` – filtrowanie i sortowanie list
- `src/store.tsx` – DataProvider (useLiveQuery), UI context, ustawienia (okna planu dnia)
- `src/theme.ts` – motyw
- `src/App.tsx` – układ, widoki, skróty (Q, G+T/I/U/S), toast z „Cofnij”
- `src/components/sortable.tsx` – przeciąganie (dnd-kit): uchwyt, czujniki, komunikaty po polsku
- `src/components/BottomNav.tsx` – dolny pasek na telefonie (≤860px): Skrzynka, Dziś, Nadchodzące, Projekty; „Projekty” = widok `browse` (menu na pełny ekran: projekty, etykiety, ustawienia, motyw). Na PC pasek ukryty, menu boczne bez zmian.
- `src/components/` – Sidebar (projekty i podprojekty z przeciąganiem), QuickAdd (podświetlanie przez warstwę „mirror”), TaskItem/TaskList/TaskTree, TaskEditor (okno), DayPlan (oś dnia), icons
- `src/views/` – Today, Inbox, Upcoming, ProjectView (etapy z przeciąganiem zadań, sekcja podprojektów), LabelView, Settings, TodoistImport, Header (na telefonie okrągły przycisk „+” otwiera szybkie dodawanie od dołu)
- `src/todoist.ts` – import z Todoist: API v1 (token, na telefonie przez CapacitorHttp) albo pliki CSV; projekty, sekcje→etapy, podzadania, etykiety, daty, powtarzanie; bez duplikatów (testy w `todoist.test.ts`)
- `src/native.ts` + `android/.../PlanBarsPlugin.java` – w APK: wysokość paska stanu/nawigacji (`--safe-top`, `--safe-bottom` w CSS) i kolor ikon paska zgodny z motywem

## Stan (2026-11-02, wersja 2 + APK)
Zrobione: płaski wygląd na telefonie jak w Todoist (bez kart, linie między zadaniami, okrągłe pola, przycisk „+”), odstęp od paska stanu w APK, import z Todoist, dolny pasek nawigacji na telefonie (jak w Todoist), APK na Androida (Capacitor), etap 1, etap 2, część etapu 3 (projekty z etapami, przeciąganie zadań w etapie i między etapami, następne działanie, postęp), podprojekty (jeden poziom).
Brakuje wg planu: widok tablicy etapów (3), filtry (4),
przeciąganie bloków / wydarzenia stałe / widok tygodnia (5), planista dnia (6), PWA (7).

Znane ograniczenia: nowa nazwa projektu/etykiety z kilku słów wymaga cudzysłowu;
przy otwartym oknie zadania kliknięcie podzadania otwiera je bez zapisu zmian rodzica.

## Poprawki zgłoszone przez Piotra
(dopisywać tutaj, odhaczać po zrobieniu)
- [x] Przesuwanie projektów w menu (uchwyt ⋮⋮ po najechaniu; podprojekt można przeciągnąć do innego projektu)
- [x] Przesuwanie zadań w projekcie (w etapie i między etapami)
- [x] Powtarzanie w wybrane dni tygodnia (okno zadania: „W wybrane dni tygodnia”; parser: „co wt, czw i pt”)
- [x] Podprojekty: widok pod głównym projektem, zagnieżdżenie w menu, „Należy do projektu” w edycji projektu
- [x] Wersja na telefon jako APK (Android)
- [x] Dolny pasek na telefonie jak w Todoist: Skrzynka, Dziś, Nadchodzące, Projekty
- [x] Treść na telefonie zaczyna się pod paskiem stanu; prostszy, czytelniejszy wygląd jak w Todoist
- [x] Import zadań z Todoist (Ustawienia → Import z Todoist)
