# Changelog BTMap

## Niewydane

### Rumunia na mapie
- **Stacje z Rumunii**: ponad 700 stacji Orange RO, Vodafone RO, Telekom RO i Digi RO z bazy NetMonstera użytkownika z Rumunii (za jego zgodą). Komórki wpisane pod kilkoma sieciami (współdzielenie RAN) trafiają do operatora, pod którym widziano je najczęściej.
- **Filtry dopasowują się do kraju** na środku mapy: w Rumunii operatorzy RO i rumuńskie pasma, bez województw; wybory, których nie ma w nowym kraju, same się czyszczą.
- **Dodawanie stacji w Rumunii**: formularz startuje w miejscu, które oglądasz, operatorzy i plan pasm zależą od kraju pinezki, walidacja sprawdza pasmo zamiast polskich zakresów operatorów.
- **Wyszukiwarka**: prefiks `226 10` wskazuje Orange RO (`226 01` Vodafone, `226 03` Telekom, `226 05` Digi).
- Rumuński regulator (ANCOM) nie publikuje wykazu stacji, więc w Rumunii są tylko dane społeczności.

### Komórki w karcie stacji
- **Tabela jak w logu NetMonstera**: komórki z bazy BTMap w kolumnach Pasmo, Azymut, eNBID/gNBID, CLID, ECI/NCI, PCI, EARFCN (z częstotliwością MHz) i Notatki; w nagłówku technologii TAC/LAC.
- **Nowe komórki na zielono, zmienione na żółto** przez 30 dni, z datą dodania lub zmiany. Daty zapisują się przy każdej zmianie stacji; nowe pozwolenia UKE też podświetlają się na zielono.
- **Edycja stacji z bazy BTMap** zmienia ją na miejscu zamiast tworzyć kopię.

### Opcje tylko tam, gdzie działają
- Poza Polską filtry i karta stacji pokazują tylko to, co ma dane: bez warstw PEM i radiolinii, wyboru źródła UKE, CDMA/IoT i audytu operatorów (dane z Polski); profil terenu zostaje (wysokości z Open-Meteo).

### Poprawki
- **Filtr pasm** obejmuje komórki z bazy BTMap zapisane jako „1800 (b3)”.
- **Karta stacji**: dla komórek społeczności zamiast pustego pola pozwolenia widać eNB:CID, PCI i EARFCN; raporty SI2PEM tylko dla stacji w Polsce.
- **Statystyki** liczą tylko stacje w Polsce.

## v2.0.4 (2026-11-15)

Wyszukiwanie komórek 5G SA prosto z NetMonstera, odnajdywanie stacji Play po gNB/eNB, rzeczywiste wysokości anten z Rejestru Urządzeń UKE, odświeżone statystyki i formularz zgłoszeń oraz seria poprawek synchronizacji, bezpieczeństwa i mapy.

### Wyszukiwarka komórek 5G SA i LTE
- **Zapytania wklejone z NetMonstera**: wyszukiwarka rozumie `gNB:CID 56680:35`, NCI/CI (np. `14510115`), prefiks PLMN (`260 06`) oraz pola `ARFCN`, `PCI`, `TAC`, `RSRP` – zbędne pola są pomijane, a numer stacji zostaje.
- **Operator i pasmo z ARFCN**: NR-ARFCN i EARFCN przeliczane są na częstotliwość i pasmo; w paśmie C (3,4–3,8 GHz) wyszukiwarka sama rozpoznaje operatora z bloku aukcyjnego (Plus, Play, Orange, T-Mobile).
- **Lepsza kolejność wyników**: najpierw stacje operatora z PLMN/ARFCN i stacje z 5G, a przy niejednoznacznym numerze podpowiedź „eNodeB / gNodeB”.
- **Poprawione zakresy n78**: zakresy NR-ARFCN operatorów w paśmie 3,6 GHz zgodne z rzeczywistym podziałem bloków.

### Stacje Play po numerze gNB / eNB
- **Przypisywanie gNB/eNB do stacji**: w karcie stacji można przypisać numer gNB lub eNB odczytany z NetMonstera; zgłoszenia przechodzą moderację (administrator zapisuje od razu, autor dostaje punkty).
- **Trwałe powiązania**: przypisanie podąża za identyfikatorem stacji operatora, więc przetrwa kolejne synchronizacje rejestru.
- **Najbliższe stacje**: gdy numer nie jest jeszcze przypisany, wyszukiwarka pokazuje najbliższe stacje Play/Plus z daną technologią i pasmem wraz z odległością, a karta stacji podpowiada przypisanie numeru.

### Rejestr Urządzeń UKE i mapa
- **Import Rejestru Urządzeń (wpisy REJ)** w ramach synchronizacji rejestru oraz **rzeczywiste wysokości anten** zamiast wartości zakładanych.
- **Azymuty anten tylko z prawdziwych źródeł** – z pozwoleń UKE, bez zgadywania.
- **Usuwanie stacji, których nie ma już w rejestrze**, synchronizacja „wszystko albo nic” z prawidłową datą wykazu oraz odczyt współrzędnych sieci prywatnych w formacie DDMMSS.
- **Radiolinie**: wszystkie linie na tej samej trasie w jednym okienku; kropki stacji pozostają klikalne pod radioliniami.
- **Limit 1000 stacji i radiolinii w widoku** oraz spokojniejsze sektory anten na mapie.
- **Natychmiastowe podpowiedzi wyszukiwarki**: stacje, ulice i miejscowości; nowy wygląd paska wyszukiwania.

### Statystyki, audyt i analiza
- **Nowe widoki statystyk**: przyrost sieci, rejestr UKE, radiolinie, baza BTMap i jakość danych; raporty przyrostu liczone z migawek rejestru.
- **Audyt pokrycia** ocenia każdą stację UKE (pomiary SI2PEM jako dodatkowy atut) i nie ocenia operatorów bez pomiarów.
- **Profil terenu i analiza** bez zgadywania terenu, sektorów i widoczności; nowy, zwarty układ panelu.
- **Okno SI2PEM**: czytelniejsza tarcza kierunków anten w kolorach operatora.

### Zgłaszanie stacji i historia
- **Nowy formularz zgłoszenia stacji**: zaokrąglony wygląd, ostylowane listy wyboru, logotypy operatorów i właścicieli konstrukcji (m.in. Cellnex / On Tower Poland, PKP PLK, Energa).
- **Historia zmian** tylko dla stacji BTMap i tylko ich zmian w BTMap; wpisy bez daty oznaczone jako nieznane.
- **Zatwierdzone zgłoszenia** publikowane jako rekordy BTMap; zdjęcia stacji do 15 MB.

### Bezpieczeństwo i stabilność
- Limit prób logowania na adres IP klienta za proxy nginx oraz limit zapisów w API.
- Błędy wewnętrzne nie trafiają do odpowiedzi API; serwer kończy pracę po nieobsłużonym wyjątku.
- Kompresja i cache plików statycznych, lżejszy obraz API, bezpieczniejsze stronicowanie harmonogramu SI2PEM.
- Standardy społeczności GitHub, polityka bezpieczeństwa, OpenSSF Scorecard, metadane cytowania i rozbudowane testy.

---

## v2.0.3 (2026-11-08)

Najnowsze wykazy Rejestru Urządzeń BIP UKE (stan na 06.11.2026), kompletna baza stacji i komórek Plusa (Polkomtel), 22 wykazy pozwoleń radiowych UKE, linie radiowe z 26.10.2026, precyzyjne azymuty sektorów anten oraz nowy moduł ODU Manager.

### Rejestr Urządzeń i pozwolenia radiowe BIP UKE (listopad 2026)
- **Oficjalne rejestry urządzeń operatorów (06.11.2026)**: zaimportowano najnowsze pliki Rejestru Urządzeń UKE: `2026-11-06_orange.xlsx`, `2026-11-06_t-mobile.xlsx`, `2026-11-04_p4.xlsx` oraz `2026-10-28_polkomtel.xlsx` – ponad 768 tys. aktywnych sektorów i komórek.
- **Kompletna baza Plusa (Polkomtel)**: włączenie do ogólnopolskiej bazy 10 962 fizycznych stacji bazowych Plusa oraz ponad 300 tys. sektorów we wszystkich pasmach (GSM, UMTS, LTE i 5G).
- **22 pliki pasmowe pozwoleń radiowych (26.10.2026 / 04.11.2026)**: zaimportowano 197 289 pozwoleń radiowych (GSM, UMTS, LTE, 5G C-Band 3.5 GHz, sieci prywatne 5G 3.8–4.2 GHz).
- **Precyzyjne azymuty sektorów**: odczyt i prezentacja rzeczywistych azymutów promieniowania anten (np. `50° / 170° / 290°`) bezpośrednio w karcie stacji i tabeli pasm.
- **Daty wpisów UKE**: wyświetlanie dokładnej daty rejestracji (`Wpis UKE: YYYY-MM-DD`) oraz odznaki nowego pozwolenia dla stacji dodanych w październiku i listopadzie 2026 r.

### Zaktualizowane statystyki i wykazy przyrostu sieci
- **Nowe okresy w raportach miesięcznych**:
  - `Listopad / Październik 2026 (stan 06.11.2026)`
  - `Wykaz z 06.11.2026 (Orange, T-Mobile)`
  - `Wykaz z 04.11.2026 (Play / P4 + 5G)`
  - `Wykaz z 28.10.2026 (Plus / Polkomtel)`
  - `Wykaz z 26.10.2026 (Pozwolenia + Radiolinie)`
- **Korekta zliczania sektorów w 15 kartach pasm**: zliczanie rzeczywistych sektorów i komórek z pełnym uwzględnieniem infrastruktury Plusa.
- **Automatyczna aktualizacja wykazu linii radiowych**: baza powiększona do 38 896 linii radiowych (102 842 kanały mikrofalowe) ze stanem na 26.10.2026.

### Nowy podprojekt ODU Manager
- **Dedykowany moduł `odumanager/`**: przygotowanie struktury pod narzędzie diagnostyczno-zarządcze dla jednostek zewnętrznych LTE/5G (ZTE MC889, ZTE MC7010, Huawei B2368, Zyxel, Nokia FastMile, MikroTik).
- **Integracja z BTMap**: planowane wymuszanie pasm (Band Locking), blokowanie komórek (PCI Locking) oraz asystent precyzyjnego nakierowania anteny na maszt.

---

## v2.0.2 (2026-11-01)

Aktualizacja rejestru UKE (26.10.2026), warstwa 38,5 tys. linii radiowych, rozbudowane statystyki telekomunikacyjne i jakość danych, gotowe archiwa KMZ dla Google Earth oraz nowa oś czasu stacji.

### Synchronizacja rejestru UKE i pomiarów SI2PEM
- **Oficjalny wykaz UKE (26.10.2026)**: zaimportowano 61 321 stacji bazowych oraz 516 965 pozwoleń radiowych (GSM, UMTS, LTE, 5G).
- **Dynamiczny parser BIP UKE**: automatyczne dopasowywanie zmieniających się ścieżek plików XLSX na stronach Biuletynu Informacji Publicznej UKE z wykluczeniem zbędnych archiwów tekstowych/CSV.
- **Prawidłowe przypisanie województw**: dekodowanie 100% lokalizacji na podstawie prefiksów TERYT oraz koordynatów GPS.
- **Optymalizacja synchronizacji SI2PEM**: pobieranie harmonogramu i planów pomiarów z inteligentnym filtrem dat i paginacją (`pageSize: 100`).
- **Narzędzia CLI**: zoptymalizowane polecenia `pnpm sync:uke` oraz `pnpm sync:si2pem` z automatycznym inwalidowaniem pamięci podręcznej statystyk.

### Radiolinie UKE (łącza mikrofalowe punkt–punkt)
- **Warstwa radiolinii**: 38 518 oficjalnych linii radiowych UKE w pasmach od 7 GHz do 86 GHz (E-Band) z filtrowaniem według operatora.
- **Szczegółowa karta techniczna przęsła**: częstotliwość, szerokość kanału, polaryzacja (V/H), moc nadajnika (TX), zysk anteny oraz dane decyzji UKE.
- **Wektorowe logotypy i barwy operatorów**: Orange, Play, Plus / Towerlink, T-Mobile, EmiTel, Netia, EXATEL, PGE, Tauron.
- **Automatyczna aktualizacja**: comiesięczna synchronizacja linii radiowych z portalu Dane.gov.pl.

### Rozbudowane statystyki telekomunikacyjne i jakość danych
- **Rozwijane podmenu w nawigacji bocznej**: Rejestr UKE, Radiolinie UKE, Wewnętrzna baza oraz Jakość danych.
- **Matematyczna korekta wykresów udziału**: jednoznaczny podział 100% pozwoleń z równoległym wskaźnikiem penetracji stacji bazowych.
- **Wskaźniki modernizacji sieci**: stacje z agregacją LTE-Advanced (≥3 oraz ≥4 pasma), wdrożenia 5G C-Band 3.6 GHz (n78) vs 5G DSS oraz kolokacje masztów w promieniu 60 m.
- **Analityka radiolinii**: podział pasm ITU, średnie i maksymalne długości przęseł oraz rozkład geograficzny w 16 województwach.
- **Dynamiczne podsumowania**: zasilane bezpośrednio z bazy danych SQLite bez zahardkodowanych wartości.

### Gotowe archiwa KMZ dla Google Earth
- **Dedykowany moduł pobieralni**: pregenerowane paczki stacji bazowych oraz radiolinii gotowe do importu do Google Earth.
- **Podział regionalny**: 16 województw, nowo dodane obiekty oraz paczki ogólnopolskie z rzeczywistymi datami generowania i rozmiarem plików.
- **Wysoka wydajność**: natychmiastowe pobieranie gotowych plików KMZ bez obciążania procesora i bazy serwera w czasie rzeczywistym.

### Historia stacji bazowej i diagramy SI2PEM
- **Oś czasu stacji**: chronologiczna prezentacja rzeczywistych zdarzeń dodania i modyfikacji stacji oraz komórek radiowych.
- **Róża wiatrów SI2PEM**: wyeliminowanie nakładania się etykiet azymutów przy zbliżonych kątach wiązek antenowych.
- **Identyfikator NetWorkS!**: odświeżona stylistyka i zoptymalizowany kontrast odznaki stacji współdzielonych w obu motywach (Dark i Light).
- **Uporządkowanie panelu**: usunięcie zbędnego boksu identyfikatorów komórkowych na rzecz czytelniejszej karty technicznej.

---

## v2.0.1 (2026-10-25)

Pełna lokalizacja w języku angielskim, audyt i ocena operatorów w terenie, stożki azymutów anten, profil terenu DEM ze strefami Fresnela oraz nowy interfejs Dark Modern.

### Dodawanie stacji i komórek dla 4 operatorów
- Przebudowany interfejs formularza dodawania i edycji stacji bazowych zgodny ze standardem frontend-design (Dark Modern, typografia Manrope, precyzyjne tabelaryczne dane RF).
- Dotykowy selektor operatora z autentyczną kolorystyką marek: Orange, Play, Plus i T-Mobile z subtelnym podświetleniem glow i wskaźnikiem wyboru.
- Pełna weryfikacja parametrów komórek radiowych dla wszystkich 4 sieci (sprawdzanie wyłączności pasm np. B38 Plus, sugerowanie standardowych nośnych EARFCN/NR-ARFCN, walidacja PCI, CID i CLID w czasie rzeczywistym).
- Wygodny przycisk „Dodaj stację” w pasku narzędzi i HUDzie mapy umożliwiający szybkie otwarcie kreatora z dowolnego miejsca.

### Audyt i ocena operatorów w terenie
- Narzędzie oceny zasięgu i infrastruktury 4 głównych operatorów (Orange, Play, Plus, T-Mobile) w promieniu do 3 km².
- Obiektywna punktacja oparta na rzeczywistych parametrach: odległość od stacji, pasma pojemnościowe i zasięgowe, 5G NR/C-band, wysokość zawieszenia anten oraz ukształtowanie terenu.
- Pełne uwzględnienie współpracy NetworkS! – stacje i maszty współdzielone pomiędzy Orange a T-Mobile są poprawnie zaliczane dla obu sieci.
- Szczegółowa, rozwijana lista plusów i minusów każdego operatora wraz z rekomendacją najlepszego wyboru w danej lokalizacji.

### Azymuty i sektory anten na mapie
- Nowa warstwa „Azymuty” dostępna w panelu filtrów mapy.
- Wizualizacja kierunków promieniowania anten w postaci eleganckich stożków sektorowych z centralną linią celowania.
- Precyzyjne etykiety kątów w stopniach (np. 30°, 120°, 240°) umieszczone centralnie wewnątrz wiązki każdego sektora.
- Priorytetyzacja rzeczywistych azymutów odczytanych z laboratoryjnych sprawozdań pomiarowych SI2PEM (PDF).

### Profil terenu i propagacja radiowa
- Interaktywne narzędzie profilu wysokościowego (DEM) pomiędzy stacją bazową a dowolnie wybranym punktem na mapie.
- Wizualizacja linii bezpośredniej widoczności (Line of Sight) oraz pierwszej strefy Fresnela (60% i 100%) dla wybranej częstotliwości.
- Dokładne obliczenia tłumienia propagacyjnego w wolnej przestrzeni (FSPL) oraz tłumienia wstecznego listka anteny (28 dB Front-to-Back attenuation).

### Interfejs i lokalizacja
- Przełącznik języka (PL / ENG) w dolnym panelu bocznym z pełnym tłumaczeniem wszystkich widoków, dialogów i narzędzi.
- Inteligentny pasek wyszukiwania rozszerzający się płynnie podczas wpisywania adresu.
- Neutralny czarny motyw ciemny oraz dopracowany jasny motyw z zapamiętywaniem wyboru.

---

## v2.0.0 (2026-10-20)

Zbiorcze zestawienie zmian w premierowej wersji BTMap v2.

### Nowy interfejs WWW
- Przebudowany układ z mapą na pierwszym planie, boczną nawigacją i wyszukiwaniem nad mapą.
- Neutralny czarny motyw ciemny oraz jasny motyw. Zapamiętywanie wybranego wyglądu.
- Zaokrąglone panele, spójne ikony i czytelna typografia.
- Układ dostosowany do komputera, tabletu i telefonu. Zwijana nawigacja na komputerze i wysuwane menu na telefonie.
- Czytelne stany ładowania, błędów i pustych wyników, obsługa klawiaturą i ograniczenie animacji zgodnie z ustawieniami urządzenia.
- Podstrona Changelog z zestawieniem zmian w v2 i bezpośrednim adresem do udostępnienia.

### Mapa i podkłady
- Wyłącznie stacje z pozwoleń UKE w mapie, wyszukiwaniu, bazie i statystykach. Usunięte źródło BTMap.
- Pojedyncze znaczniki zamiast kółek grupujących stacje. Maksymalnie 1000 stacji w widocznym obszarze na każdym poziomie przybliżenia.
- Filtrowanie przed ograniczeniem wyników. Licznik pokazuje pełną liczbę pasujących lokalizacji, a przybliżenie i filtry pozwalają zobaczyć kolejne.
- Podkłady OpenStreetMap, Satelita Esri i Mapa terenowa. Zapamiętywanie wyboru, skala mapy i oznaczenie dostawcy.
- Google Satellite dodane do wyboru podkładów. Bez skonfigurowanego klucza opcja jest wyłączona z opisem „Chwilowo niedostępne”.
- Satelita i topografia zachowują naturalne kolory także w ciemnym motywie.
- Przybliżanie, lokalizacja użytkownika i pełny ekran mapy na obsługiwanych urządzeniach. Wyszukiwanie miejscowości, adresów, ID i współrzędnych.

### Filtry i kolory operatorów
- Zwarty rozwijany panel z wyborem operatorów, technologii, pasm i województwa, licznikiem wyników i czyszczeniem ustawień.
- Wspólne kryteria mapy i bazy stacji. Operator, technologia i pasmo są sprawdzane łącznie.
- Panel bez filtrów statusu stacji, uplinku i przełącznika źródeł.
- Spójne kolory operatorów: pomarańczowy Orange, magenta T-Mobile, fioletowy Play i zielony Plus.
- Powiązanie P4 i On Tower Poland z Play oraz Polkomtelu, Aero2 i Towerlink z Plusem w kolorach i filtrach. Nazwy podmiotów ze źródła pozostają widoczne.

### Szczegóły stacji
- Nowy szeroki panel z adresem, operatorami, ID, pochodzeniem UKE, współrzędnymi GPS i województwem.
- Najważniejsze informacje o obiekcie pojawiają się tylko wtedy, gdy są dostępne.
- Raporty SI2PEM są rozdzielone według operatora. Liczba i dokumenty każdego operatora są pokazywane osobno.
- Kopiowanie współrzędnych i bezpośredniego linku do stacji z potwierdzeniem wykonania.
- Usunięte zapisane stacje oraz przyciski „Zapisz” i „Dojazd”.
- Usunięte komentarze i „Zgłoś uwagę” z panelu stacji. Specyfikacja i raporty SI2PEM pozostają na pierwszym planie.
- Wyraźna informacja, że pozwolenie UKE nie potwierdza uruchomienia stacji ani rzeczywistego zasięgu.

### Raporty i anteny SI2PEM
- Dokumenty SI2PEM powiązane ze stacją przez identyfikator i lokalizację.
- Rozwijana lista według lat, z datą, typem dokumentu, publikującym i oznaczeniem najnowszego raportu PDF.
- Raporty PDF SI2PEM otwierają osobny panel anten. Formularze zgłoszenia, również w PDF, wyszukiwarka i inne odnośniki otwierają się bezpośrednio w przeglądarce.
- Odczyt z obsługiwanych tabel PDF: modele i producenci anten, wysokości, azymuty, pasma, pochylenia, zakresy regulacji i EIRP. Schemat kierunków, zestawienie wysokości i wskazanie strony źródłowej.
- Identyczne ustawienia anten są pokazane wspólnie, a różnice między pasmami pozostają widoczne. Dostępne punkty pomiarowe można rozwinąć pod tabelą.
- Licznik obejmuje różne dostępne adresy raportów PDF, bez formularzy i wyszukiwarki. Potwierdzony brak to 0; ładowanie, błąd i niepełne dane mają odrębne oznaczenia.
- Skany i nierozpoznane układy PDF mają jawny komunikat oraz dostęp do dokumentu źródłowego. Brakujących parametrów nie zastępują przykładowe dane.

### Pomiary PEM na mapie
- Opcjonalna warstwa „Pomiary PEM” w filtrach, oparta na oficjalnym harmonogramie SI2PEM.
- Kwadratowe znaczniki w kolorze operatora. Po kliknięciu widoczne są wykonawca, planowany termin od–do, lokalizacja i dostępny odnośnik do źródła lub raportu.
- Pomijanie anulowanych wpisów. Pomiary znikają z warstwy po 2 dniach kalendarzowych od daty zakończenia. Błąd źródła zachowuje ostatnie poprawne dane.
- Filtr operatora obejmuje także pomiary PEM. Pozostałe kryteria opisują stacje UKE.

### Baza, statystyki i konta
- Wyszukiwanie w bazie bez konieczności wpisywania polskich znaków, paginacja, przejście do stacji na mapie i eksport bieżącej strony do CSV.
- Statystyki lokalizacji, operatorów, technologii i województw na podstawie pozwoleń UKE.
- Konta i profil użytkownika oraz historia wcześniejszych zgłoszeń. Dostęp do moderacji zależy od uprawnień konta.
- Usprawnione logowanie, profil użytkownika i moderacja dostępna zgodnie z uprawnieniami konta.
- Zgłoszenia użytkowników nie zmieniają treści pozwoleń UKE.

### Większa niezawodność
- Czytelniejsze komunikaty, gdy dane są wczytywane, niedostępne albo nie znaleziono wyników.
- Poprawione działanie mapy, filtrów, podkładów oraz listy dokumentów SI2PEM.
- Dostosowanie interfejsu do węższych ekranów i obsługi klawiaturą.
