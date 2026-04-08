// data/riddles.js — 100 zagadek z Bleacha
// Każda zagadka: { q, hint, answers: [] }
// answers — lowercase, match case-insensitive; wystarczy 1-2 słowa

module.exports = [
  // ── POSTACIE — Shinigami ─────────────────────────────────────────────────
  { q: 'Moje zanpakuto nosi imię Zabimaru i wygląda jak wąż z głową babuina. Kim jestem?', hint: 'Jestem porucznikiem 6. Kompanii z tatuażami na twarzy.', answers: ['renji', 'abarai'] },
  { q: 'Moje bankai to Senbonzakura Kageyoshi — tysiące płatków wiśni zamieniają się w miecze. Kim jestem?', hint: 'Jestem dumnym kapitanem 6. Kompanii i adoptowanym bratem Rukii.', answers: ['byakuya', 'kuchiki'] },
  { q: 'Jestem kapitanem uznawanym za cud — miałem bankai jako dziecko. Kim jestem?', hint: 'Moje zanpakuto kontroluje lód i śnieg.', answers: ['hitsugaya', 'toushiro'] },
  { q: 'Jestem byłą szefową Onmitsukidou i jestem najszybszą w Soul Society. Kim jestem?', hint: 'Potrafię zamienić się w czarnego kota.', answers: ['yoruichi', 'shihoin'] },
  { q: 'Jestem kapitanem 11. Kompanii i walczę dla przyjemności. Kim jestem?', hint: 'We włosach noszę srebrne dzwoneczki.', answers: ['kenpachi', 'zaraki'] },
  // [5] — usunięto nazwę z pytania
  { q: 'Jak nazywa się najpotężniejsze zanpakuto lodu w Soul Society?', hint: 'Należy do najmłodszego kapitana Gotei 13. Kontroluje lód i wiatr.', answers: ['hyorinmaru', 'hyōrinmaru'] },
  { q: 'Byłam kapitanem 4. Kompanii — medykiem i zarazem najstarszym shinigami po Yamamoto. Kim jestem?', hint: 'Znana jestem też jako Kenpachi z powodu strachu jaki wzbudzam.', answers: ['unohana', 'retsu'] },
  { q: 'Lubię sake i drzemki, a moje zanpakuto pozwala mi tworzyć gry z wiatrem. Kim jestem?', hint: 'Jestem kapitanem 8. Kompanii z szerokim kapeluszem.', answers: ['shunsui', 'kyoraku'] },
  { q: 'Jestem byłym kapitanem 5. Kompanii i głównym antagonistą pierwszej sagi. Kim jestem?', hint: 'Lubię herbatę i manipuluję wszystkimi wokół.', answers: ['aizen', 'sosuke'] },
  { q: 'Moje zanpakuto Haineko rozsypuje się w popiół. Kim jestem?', hint: 'Jestem porucznikiem 10. Kompanii z długimi blond włosami.', answers: ['rangiku', 'matsumoto'] },
  // [10] — Aiizen → Aizen
  { q: 'Jestem niewidomym byłym kapitanem, który odszedł z Aizenem. Kim jestem?', hint: 'Wierzę, że cel uświęca środki.', answers: ['tousen', 'kaname'] },
  // [11] — duplikat Unohana zastąpiony inną postacią
  { q: 'Jestem kapitanem 12. Kompanii i prowadzę eksperymenty na schwytanych wrogach. Kim jestem?', hint: 'Jestem też szefem Departamentu Badań i Rozwoju.', answers: ['mayuri', 'kurotsuchi'] },
  { q: 'Jestem szefem Kidō Corps, który przyszedł z pomocą w wojnie z Quincy. Kim jestem?', hint: 'Moje ciało jest niemal zniszczone po eksperymentach Mayuri.', answers: ['tessai', 'tsukabishi'] },

  // ── POSTACIE — Espada ────────────────────────────────────────────────────
  { q: 'Jestem Sexta Espada i obsesyjnie szukam walki z Ichigo. Kim jestem?', hint: 'Moje resurreción to Pantera — zamieniam się w panterę.', answers: ['grimmjow', 'jaegerjaquez'] },
  { q: 'Jestem Cuarta Espada i mam dwie formy resurreción, drugą tworzę z ciemności. Kim jestem?', hint: 'Noszę biały panel maskowy pod lewym okiem.', answers: ['ulquiorra', 'cifer'] },
  { q: 'Jestem jedyną kobietą wśród Espada. Kim jestem?', hint: 'Moje resurreción to Tiburón — zamieniam się w rekina.', answers: ['harribel', 'tier'] },
  // [16] — Aiizen → Aizen
  { q: 'Moja moc starzenia niszczy wszystko — nawet nieśmiertelność. Kim jestem?', hint: 'Byłem królem Hueco Mundo przed Aizenem. Jestem Segunda Espada.', answers: ['baraggan', 'louisenbairn'] },
  { q: 'Jestem Primera Espada i zawsze śpię lub jestem leniwy. Kim jestem?', hint: 'Towarzyszy mi para wilków z mojego resurreción.', answers: ['starrk', 'coyote'] },
  { q: 'Moje resurreción pozwala mi pochłaniać dusze innych Espada — ukrywa się we mnie Kaien Shiba. Kim jestem?', hint: 'Udaję, że jestem kimś innym niż jestem.', answers: ['aaroniero', 'arruruerie'] },
  { q: 'Jestem Quinto Espada z długimi rękami i sierpem. Nienawidzę walczących kobiet. Kim jestem?', hint: 'Moje resurreción Santa Teresa to bogomódlka.', answers: ['nnoitora', 'gilga'] },
  { q: 'Jestem Octava Espada i uwielbiam sztukę oraz eksperymenty. Kim jestem?', hint: 'Moje resurreción to Fornicarás.', answers: ['szayel', 'grantz'] },

  // ── POSTACIE — Quincy ────────────────────────────────────────────────────
  { q: 'Jestem ojcem Ichigo i byłym Shinigami. Kim jestem?', hint: 'Kryje się we mnie cząstka duszy Yhwacha.', answers: ['isshin', 'kurosaki'] },
  { q: 'Jestem przyjacielem Ichigo i jedynym Quincy, który przeżył masakrę. Kim jestem?', hint: 'Jestem synem Ryukena Ishidy.', answers: ['uryu', 'ishida'] },
  { q: 'Jestem władcą Quincy i Królem Króla. Kim jestem?', hint: 'Moje imię nosi proroctwo ukryte w nazwie organizacji.', answers: ['yhwach', 'juha'] },

  // ── POSTACIE — Inne ──────────────────────────────────────────────────────
  { q: 'Jestem właścicielem sklepu w żywym świecie i byłym kapitanem 12. Kompanii. Kim jestem?', hint: 'Lubię nosić pasiasty kapelusz i ukrywać swoją inteligencję.', answers: ['urahara', 'kisuke'] },
  { q: 'Jestem obecnym kapitanem 2. Kompanii i mistrzynią szybkości w walce wręcz. Kim jestem?', hint: 'Mój styl walki pochodzi od Yoruichi, którą czczę jak boginię.', answers: ['soifon', 'soi fon'] },
  { q: 'Jestem Fullbringerem, który odebrał Ichigo moce i podzielił je między swoją grupę. Kim jestem?', hint: 'Byłem pierwszym Zastępczym Shinigami, zanim Ichigo objął tę rolę.', answers: ['ginjo', 'kugo'] },
  { q: 'Jestem kapitanem 13. Kompanii z wielkim mieczem i nieuleczalną chorobą. Kim jestem?', hint: 'Jestem starym przyjacielem Yoruichi.', answers: ['ukitake', 'jushiro'] },

  // ── ZANPAKUTO / BANKAI ───────────────────────────────────────────────────
  { q: 'Jak nazywa się bankai Ichigo Kurosaki?', hint: 'To czarny miecz, który skondensował wszystkie moce.', answers: ['tensa zangetsu'] },
  { q: 'Jak nazywa się zanpakuto, które zamienia się w tysiące płatków wiśni?', hint: 'Należy do kapitana 6. Kompanii.', answers: ['senbonzakura'] },
  { q: 'Jak nazywa się zanpakuto Rukii Kuchiki — uważane za najpiękniejsze w Soul Society?', hint: 'Kontroluje lód i śnieg. Jej shikai wygląda jak biały taniec.', answers: ['sode no shirayuki'] },
  { q: 'Jak nazywa się zanpakuto Renjiego Abarai?', hint: 'To połączenie węża i pawiana.', answers: ['zabimaru'] },
  { q: 'Jak nazywa się bankai Sajina Komamury — gigantyczny zbrojny wojownik?', hint: 'Kapitan 7. Kompanii używa go jako olbrzymiego rycerza w zbroi.', answers: ['kokujō tengen myōō', 'tengen myoo'] },
  { q: 'Jak nazywa się bankai Soifon — ta wystrzelona dwa razy w to samo miejsce zabija?', hint: 'Wygląda jak ogromna rakieta na ramieniu.', answers: ['jakuhō raikōben'] },
  { q: 'Jak nazywa się zanpakuto Kenpachi Zarakiego?', hint: 'Przez długi czas nie znał jego imienia.', answers: ['nozarashi'] },
  { q: 'Jak nazywa się bankai Byakuyi Kuchikiego?', hint: 'Tysiące płatków wiśni otaczają wroga jak sieć z ostrzy.', answers: ['senbonzakura kageyoshi'] },
  // [36] — Urahar'y → Urahary
  { q: 'Jak nazywa się zanpakuto Urahary Kisuke — kija ze ściągaczem?', hint: 'Może tworzyć wiele specjalnych technik i pochłaniać ataki.', answers: ['benihime'] },

  // ── TECHNIKI / ZDOLNOŚCI ─────────────────────────────────────────────────
  { q: 'Jak nazywa się technika najszybszego ruchu shinigami?', hint: 'Dosłownie — "kroki błyskawicy".', answers: ['shunpo', 'flash step'] },
  { q: 'Jak nazywa się potężna magiczna technika shinigami dzielona na hadō i bakudō?', hint: 'Wymaga zaklęcia i duchowej energii.', answers: ['kido', 'kidō'] },
  { q: 'Jak nazywa się klasa ofensywnych zaklęć kido?', hint: 'Na przykład Hadō nr 90 — Kurohitsugi.', answers: ['hado', 'hadō'] },
  { q: 'Jak nazywa się klasa defensywnych i wiążących zaklęć kido?', hint: 'Na przykład Bakudō nr 61 — Rikujōkōrō.', answers: ['bakudo', 'bakudō'] },
  { q: 'Jak nazywa się technika Ichigo, którą zwalnia z zanpakuto łuk duchowej energii?', hint: 'Używa jej zarówno w shikai jak i w bankai.', answers: ['getsuga tensho', 'getsuga'] },
  { q: 'Jak nazywa się potężny wybuch energii Espada strzelany z ust lub ręki?', hint: 'Hollowowie używają go przeciw shinigami.', answers: ['cero'] },
  { q: 'Jak nazywa się pierwsza forma zanpakuto, gdzie shinigami wypowiada jego imię?', hint: 'Wymagana przed bankai.', answers: ['shikai'] },
  { q: 'Jak nazywa się ostateczna forma zanpakuto?', hint: 'Wymaga gruntownego poznania swojego zanpakuto.', answers: ['bankai'] },
  { q: 'Jak nazywa się portal przez który Hollowowie i Arrancarowie podróżują między światami?', hint: 'Tworzy czarną szczelinę w przestrzeni.', answers: ['garganta'] },
  { q: 'Jak nazywa się skóra Espada odporna na ataki — naturalny pancerz?', hint: 'Grimmjow szczyci się jej twardością.', answers: ['hierro'] },
  { q: 'Jak nazywa się zmysł detekcji reiatsu u Hollowów dający precyzyjną lokalizację ofiary?', hint: 'Odpowiednik sonaru u Hollowów.', answers: ['pesquisa'] },
  { q: 'Jak nazywa się technika regeneracji Hollowów?', hint: 'Pozwala im odrastać kończyny i naprawiać rany.', answers: ['regeneration', 'regeneracja'] },
  // [49+79] — usunięto duplikat hirenkyaku; zostaje jeden z poprawnym pytaniem
  { q: 'Jak nazywa się technika szybkiego ruchu Quincy — odpowiednik shunpo shinigami?', hint: 'Quincy unosi się i przemieszcza po cząsteczkach reishi.', answers: ['hirenkyaku'] },
  { q: 'Jak nazywa się technika Soifon — mały jad zostawiający piętno śmierci?', hint: 'Dwa trafienia w to samo miejsce = śmierć.', answers: ['nigeki kessatsu'] },

  // ── MIEJSCA ──────────────────────────────────────────────────────────────
  { q: 'Jak nazywa się świat dusz zamieszkały przez shinigami?', hint: 'Ichigo tam walczył by uratować Rukię.', answers: ['soul society', 'seireitei'] },
  { q: 'Jak nazywa się centralna twierdza Soul Society?', hint: 'Zamieszkują ją shinigami i mieści się tam Gotei 13.', answers: ['seireitei'] },
  { q: 'Jak nazywa się dzielnica biedoty wokół Seireitei?', hint: 'Renji i Rukia tam dorastali.', answers: ['rukongai'] },
  { q: 'Jak nazywa się świat Hollowów — wieczna noc i pustynne krajobrazy?', hint: 'Aizen tam wybudował Las Noches.', answers: ['hueco mundo'] },
  { q: 'Jak nazywa się zamek Aizena w Hueco Mundo?', hint: 'To największa budowla w świecie Hollowów.', answers: ['las noches'] },
  { q: 'Jak nazywa się miasto, w którym mieszka Ichigo?', hint: 'To japońskie miasto z wielką ilością duchów.', answers: ['karakura'] },
  { q: 'Jak nazywa się wymiar pomiędzy światami, przez który przepływają Hollowowie?', hint: 'Portal do Hueco Mundo przecina to miejsce.', answers: ['precipice world', 'dangai'] },
  { q: 'Jak nazywa się więzienie w Soul Society, gdzie przetrzymywano Rukię?', hint: 'To wysoka wieża o szczególnych właściwościach.', answers: ['senzaikyu', 'senzaikyū'] },
  { q: 'Jak nazywa się fałszywe miasto Karakura stworzone przez shinigami?', hint: 'Aizen zamierzał w prawdziwej Karakurze wykonać rytuał.', answers: ['fake karakura'] },
  // [59] — Wandenreich nie jest "wymiarem Uryu Ishidy"
  { q: 'Jak nazywa się ukryte imperium Quincy, którego królem jest Yhwach?', hint: 'Jego siedziba kryje się w cieniu Soul Society.', answers: ['wandenreich'] },

  // ── PRZEDMIOTY / ARTEFAKTY ────────────────────────────────────────────────
  // [61+104] — duplikat hogyoku; zostaje jeden
  { q: 'Jak nazywa się sferyczny artefakt, o który walczyli Aizen i shinigami?', hint: 'Może przekształcić granicę między shinigami a Hollow.', answers: ['hogyoku', 'hōgyoku'] },
  { q: 'Jaki kolor ma Hōgyoku?', hint: 'Ma barwę królewską — kolor władzy.', answers: ['fioletowy', 'purpurowy'] },
  { q: 'Jak nazywa się czarny strój noszony przez shinigami?', hint: 'To uniformowy strój wyróżniający shinigami.', answers: ['shihakusho', 'shihakushō'] },
  // [64] — słowo "medalion" usunięte z pytania
  { q: 'Jak nazywa się przedmiot, który Sternritterzy Quincy wbijali w serce shinigami, by ukraść bankai?', hint: 'Yhwach rozdał je przed inwazją na Soul Society.', answers: ['medallion', 'medalion'] },
  { q: 'Jak nazywa się specjalny proszek, który Mayuri Kurotsuchi używa w walce?', hint: 'Paraliżuje nerwy i zmysły wroga.', answers: ['ashisogi jizo'] },
  { q: 'Jak nazywa się gigantyczna brama używana do podróży do Soul Society?', hint: 'Urahara z niej korzystał by wysłać Ichigo.', answers: ['senkaimon'] },
  { q: 'Jak nazywa się sztuczne ciało shinigami pozwalające żyć w świecie żywych?', hint: 'Urahara sprzedaje je w swoim sklepie.', answers: ['gigai'] },

  // ── POJĘCIA / TERMINOLOGIA ────────────────────────────────────────────────
  { q: 'Jak nazywa się duchowa energia istot duchowych?', hint: 'Im silniejszy shinigami, tym większe jej ciśnienie.', answers: ['reiatsu'] },
  { q: 'Jak nazywa się wewnętrzna energia duchowa — zasób z którego czerpie reiatsu?', hint: 'To jakościowa miara mocy, nie ilościowa.', answers: ['reiryoku'] },
  { q: 'Jak nazywa się duch zamieszkujący zanpakuto?', hint: 'Shinigami musi się z nim porozumieć by wejść w shikai.', answers: ['zanpakuto spirit'] },
  { q: 'Jak nazywa się wewnętrzny świat shinigami, gdzie żyje duch zanpakuto?', hint: 'Tam Ichigo rozmawiał ze swoim duchem.', answers: ['inner world'] },
  { q: 'Jak nazywa się transformacja Espada porównywalna do bankai shinigami?', hint: 'Uwalnia ukryte moce przez zdejmowanie warstwy ochrony.', answers: ['resurreccion', 'resurreción'] },
  // [73] — "fullbring" usunięte z pytania
  { q: 'Jak nazywa się zdolność ludzi o duchowej wrażliwości, pozwalająca manipulować duszą obiektów?', hint: 'Pochodzi od Hollowa, który dotknął ich matki przed urodzeniem.', answers: ['fullbring'] },
  { q: 'Jak nazywa się technika zgrywania dusz, którą shinigami przeprowadza na Plusie?', hint: 'Rysuje znak krzyżyka na czole ducha i wysyła go do Soul Society.', answers: ['soul burial', 'konsō'] },
  { q: 'Jak nazywają się dusze ludzkie oczekujące na przejście do Soul Society?', hint: 'Wandują one po świecie żywych ze swoim łańcuchem.', answers: ['plus', 'pluses'] },
  { q: 'Jak nazywa się masa Hollowów połączona w jeden ogromny organizm?', hint: 'Setki Hollowów tworzy jedną istotę.', answers: ['gillian', 'menos grande'] },
  { q: 'Jak nazywa się humanoidalna forma Hollowa między Gillian a Vasto Lorde?', hint: 'Mają indywidualną osobowość i znacznie większą moc.', answers: ['adjuchas'] },
  // [78] — usunięto Vasto Lorde z pytania
  { q: 'Jak nazywa się najwyższa klasa ewolucji Hollowa — rzadsza niż shinigami?', hint: 'Yamamoto obawiał się, że Aizen ma ich armię.', answers: ['vasto lorde'] },
  { q: 'Jak nazywa się stan, w którym shinigami wchodzi w duszę człowieka?', hint: 'Ichigo przyjmuje wtedy formę shinigami.', answers: ['konsho', 'soul sleep'] },

  // ── ORGANIZACJE ───────────────────────────────────────────────────────────
  { q: 'Jak nazywa się armia trzynastu kompanii shinigami?', hint: 'Strzegą dusz i zwalczają Hollowów.', answers: ['gotei 13', 'gotei'] },
  { q: 'Jak nazywa się tajna elitarna jednostka shinigami zajmująca się szpiegostwem?', hint: 'Yoruichi była jej dowódcą przez długi czas.', answers: ['onmitsukido', 'onmitsukidō'] },
  { q: 'Jak nazywa się naukowy oddział Soul Society zarządzany przez Mayuri?', hint: 'Tworzą i testują nowe technologie i bronie.', answers: ['technology development', '12 kompania', 'departament badan'] },
  { q: 'Jak nazywa się armia Quincy, która zaatakowała Soul Society pod przywództwem Yhwacha?', hint: 'Ich elitarni wojownicy noszą litery jako tytuły.', answers: ['wandenreich', 'sternritter'] },
  { q: 'Jak nazywają się shinigami z mocą Hollowa — wygnani przez Soul Society?', hint: 'Ichigo dołączył do nich by opanować swoją maskę.', answers: ['visored', 'vizard', 'vizardy'] },
  // [xcution] — pełna poprawka
  { q: 'Jak nazywa się tajna organizacja Fullbringerów, których przywódcą był dawny Zastępczy Shinigami?', hint: 'Manipulowali Ichigo, by odebrać mu moce.', answers: ['xcution'] },

  // ── LORE / TRIVIA ─────────────────────────────────────────────────────────
  { q: 'Ile kompanii ma Gotei 13?', hint: 'Odpowiedź jest w nazwie.', answers: ['13', 'trzynaście'] },
  { q: 'Jakiego koloru są ubrania shinigami?', hint: 'To tradycyjny japoński kolor żałoby.', answers: ['czarny', 'black'] },
  { q: 'Jak nazywa się Hollow, który zaatakował rodzinę Ichigo i zabił jego matkę?', hint: 'Jest związany z historią jego matki.', answers: ['grand fisher'] },
  { q: 'Ile kompania Soifon dowodzi w Gotei 13?', hint: 'To elitarna kompania zajmująca się szpiegostwem.', answers: ['2', 'druga', 'two'] },
  { q: 'Jakie jest imię ojca Ichigo Kurosakiego?', hint: 'Były kapitan shinigami ukrywający swoją tożsamość.', answers: ['isshin'] },
  { q: 'Jak nazywa się umarła żona Byakuyi Kuchikiego — biologiczna siostra Rukii?', hint: 'Z jej powodu Byakuya złamał zasady klanu Kuchiki.', answers: ['hisana'] },
  // [96] — Kazui to syn, nie córka
  { q: 'Jak na imię ma syn Ichigo i Orihime (po zakończeniu mangi)?', hint: 'Ma pomarańczowe akcenty we włosach jak matka.', answers: ['kazui'] },
  // [97] — Ichika to córka, nie syn
  { q: 'Jak na imię ma córka Rukii i Renjiego (po zakończeniu mangi)?', hint: 'Ma czerwone włosy jak ojciec.', answers: ['ichika'] },
  { q: 'Jak nazywa się zanpakuto Aizena, które tworzy idealne iluzje?', hint: 'Kto raz je ujrzał, jest na zawsze pod jego wpływem.', answers: ['kyoka suigetsu', 'kyōka suigetsu'] },
  // [100] — usunięto Hollowification z pytania
  { q: 'Jak nazywa się proces, w którym shinigami nabiera mocy Hollowa i staje się Vizardem?', hint: 'Aizen przeprowadził ten eksperyment na dawnych kapitanach.', answers: ['hollowification', 'hollowifikacja'] },
  { q: 'Jak nazywa się proces ewolucji, gdy Hollow zyskuje na sile pożerając inne Hollowy?', hint: 'Prowadzi od Gillian przez Adjuchas do Vasto Lorde.', answers: ['evolution', 'ewolucja'] },
  { q: 'Jak nazywa się specjalny typ Cero, który Ulquiorra używa w swojej drugiej formie?', hint: 'To ciemna energia wystrzelona z końcówki rogu.', answers: ['cero oscuras', 'oscuras'] },
  // [103] — Aiizen→Aizen + gran rey cero usunięte z pytania
  { q: 'Jak nazywa się specjalne Cero Grimmjowa, które miesza energię z jego własną krwią?', hint: 'Tylko Espada mogą go używać przed Aizenem.', answers: ['gran rey cero'] },
  { q: 'Jak nazywa się rytuał, który Aizen zamierzał przeprowadzić w Karakurze?', hint: 'Miał stworzyć Ōken — Klucz Króla.', answers: ['oken', 'ōken', 'royal key'] },
  // [106] — Aiizen → Aizen
  { q: 'Ile czasu minęło między zakończeniem wojny z Aizenem a sagą Fullbringerów?', hint: 'Ichigo stracił moce na ten czas.', answers: ['17 miesięcy', '17'] },
  // [107] — poprawione pytanie; Lanza del Relampago to atak Ulquiorry, nie cero
  { q: 'Jak nazywa się potężny atak Ulquiorry w formie Segunda Etapa — włócznia z czystej ciemności?', hint: 'Wystrzelona eksploduje jak bomba, niszczy duże obszary.', answers: ['lanza del relampago'] },
];
