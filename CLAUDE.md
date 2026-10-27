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

## Decyzje (ustalone z Piotrem)
- Jedna osoba, PC, aplikacja w przeglądarce, dane lokalnie (IndexedDB przez Dexie).
- Otwierana dwuklikiem z pliku (vite-plugin-singlefile), bez serwera.
- Wygląd: karty z wersji 3 + ciemny motyw z wersji 2; czcionka Plus Jakarta Sans
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
- `src/components/` – Sidebar (projekty i podprojekty z przeciąganiem), QuickAdd (podświetlanie przez warstwę „mirror”), TaskItem/TaskList/TaskTree, TaskEditor (okno), DayPlan (oś dnia), icons
- `src/views/` – Today, Inbox, Upcoming, ProjectView (etapy z przeciąganiem zadań, sekcja podprojektów), LabelView, Settings, Header

## Stan (2026-10-25, wersja 2)
Zrobione: etap 1, etap 2, część etapu 3 (projekty z etapami, przeciąganie zadań w etapie i między etapami, następne działanie, postęp), podprojekty (jeden poziom).
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
