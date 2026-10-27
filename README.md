# Plan – własna aplikacja do zadań

## Jak uruchomić
Online: **https://aipiotrlipinski.github.io/Todo/** (publikuje się automatycznie po każdej zmianie w `main`).

Offline: `npm install`, `npx vite build` i otwórz `dist/index.html` dwuklikiem.

## Gdzie są dane
Zadania zapisują się w przeglądarce na tym komputerze. Zawsze otwieraj aplikację
w tej samej przeglądarce. Wyczyszczenie danych przeglądarki usuwa zadania, dlatego
raz w tygodniu wejdź w **Ustawienia → Pobierz kopię (JSON)**.

## Szybkie dodawanie
Naciśnij **Q** i wpisz np.:

    Raport dostaw jutro 14:00 #Magazyn /Etap2 @praca !1 ~30m

- data: dziś, jutro, pojutrze, w piątek, za 3 dni, za tydzień, 12.11, 12 listopada
- godzina: 14:00, o 9
- powtarzanie: codziennie, co pon, co pon i czw, co miesiąc, w dni robocze
- #projekt, /etap, @etykieta (nowe utworzą się same; kilka słów: #"Nowy projekt")
- !1–!4 priorytet, ~30m / ~1h30m szacowany czas

## Skróty
Q – szybkie dodawanie · G potem T / I / U – Dziś / Skrzynka / Nadchodzące
Esc – zamknij okno · Ctrl+Enter – zapisz zadanie

## Co jest w tej wersji (etapy 1–2 z planu)
Skrzynka, Dziś z planem dnia, Nadchodzące (14 dni), projekty z etapami,
etykiety, podzadania, zadania powtarzalne, cofanie, jasny/ciemny motyw,
kopia zapasowa.

Następne etapy: filtry, przeciąganie bloków w kalendarzu, planista dnia.

## Kod źródłowy
Budowanie: `npm install`, potem `npm run build` (wynik w `dist/index.html`, jeden plik).
Testy parsera: `npm test`. Notatki techniczne: `CLAUDE.md`.
