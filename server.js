const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/tv',    (req, res) => res.sendFile(path.join(__dirname, 'public', 'tv.html')));
app.get('/phone', (req, res) => res.sendFile(path.join(__dirname, 'public', 'phone.html')));

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }
function generateCode() { return String(Math.floor(1000 + Math.random() * 9000)); }

const usedQuestions = {};
function pickQuestions(pool, subjectId) {
  if (!usedQuestions[subjectId]) usedQuestions[subjectId] = new Set();
  const used = usedQuestions[subjectId];
  let available = pool.map((q, i) => ({q, i})).filter(({i}) => !used.has(i));
  if (available.length < 10) {
    console.log('Recycle ' + subjectId);
    used.clear();
    available = pool.map((q, i) => ({q, i}));
  }
  const picked = shuffle(available).slice(0, 10);
  picked.forEach(({i}) => used.add(i));
  return picked.map(({q}) => q);
}

const SUBJECTS = [
  { id: 'generale',   name: 'Cultura Generale', emoji: '🌍' },
  { id: 'storia',     name: 'Storia',            emoji: '🏛️' },
  { id: 'geografia',  name: 'Geografia',         emoji: '🗺️' },
  { id: 'sport',      name: 'Sport',             emoji: '⚽' },
  { id: 'spettacolo', name: 'Spettacolo',        emoji: '🎬' },
  { id: 'scienza',    name: 'Natura e Scienza',  emoji: '🔬' },
  { id: 'musica',     name: 'Musica',            emoji: '🎵' },
];

// ── OPEN TRIVIA DB ────────────────────────────────────────────────────────────
const TRIVIA_CATEGORIES = {
  generale:   9,   // General Knowledge
  storia:     23,  // History
  geografia:  22,  // Geography
  sport:      21,  // Sports
  spettacolo: 11,  // Film
  scienza:    17,  // Science & Nature
  musica:     12,  // Music
};

// HTML entity decode
function decodeHTML(str) {
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&ldquo;/g, '"').replace(/&rdquo;/g, '"');
}

// Translate text using LibreTranslate (free, no key needed)
async function translateToItalian(text) {
  try {
    const encoded = encodeURIComponent(text);
    const url = `https://api.mymemory.translated.net/get?q=${encoded}&langpair=en|it`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error('translate failed');
    const data = await res.json();
    if (data.responseStatus === 200 && data.responseData) {
      return data.responseData.translatedText || text;
    }
    return text;
  } catch {
    return text;
  }
}

// Fetch questions from Open Trivia DB
async function fetchOnlineQuestions(subjectId, difficulty = 'medium') {
  try {
    const catId = TRIVIA_CATEGORIES[subjectId] || 9;
    const diff = ['easy','medium','hard'].includes(difficulty) ? difficulty : 'medium';
    const url = `https://opentdb.com/api.php?amount=10&category=${catId}&difficulty=${diff}&type=multiple`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();
    if (!data.results || data.results.length === 0) throw new Error('no results');

    // Process and translate questions
    const questions = await Promise.all(data.results.map(async (item) => {
      const q = decodeHTML(item.question);
      const correct = decodeHTML(item.correct_answer);
      const wrong = item.incorrect_answers.map(a => decodeHTML(a));

      // Build opts array with correct answer in random position
      const correctIndex = Math.floor(Math.random() * 4);
      const opts = [...wrong];
      opts.splice(correctIndex, 0, correct);

      // Translate question and answers
      const [tq, ...tOpts] = await Promise.all([
        translateToItalian(q),
        ...opts.map(o => translateToItalian(o))
      ]);

      return { q: tq, opts: tOpts, a: correctIndex };
    }));

    console.log(`✅ Online questions loaded for ${subjectId} (${questions.length} questions)`);
    return questions;
  } catch (err) {
    console.log(`⚠️  Online fetch failed for ${subjectId}: ${err.message} — using local questions`);
    return null; // fallback to local
  }
}

const QUESTIONS = {
  generale: [
    {q:"Qual è l'elemento chimico con simbolo Au?",opts:["Argento","Rame","Alluminio","Oro"],a:3},
    {q:"Quante ossa ha il corpo umano adulto?",opts:["186","206","226","246"],a:1},
    {q:"Qual è la valuta ufficiale del Giappone?",opts:["Yuan","Won","Yen","Ringgit"],a:2},
    {q:"Chi ha inventato il telefono?",opts:["Thomas Edison","Nikola Tesla","Graham Bell","Guglielmo Marconi"],a:2},
    {q:"Quanti continenti ci sono sulla Terra?",opts:["5","6","7","8"],a:2},
    {q:"Qual è il paese con più abitanti al mondo?",opts:["India","Cina","USA","Indonesia"],a:0},
    {q:"Qual è la formula chimica dell'acqua?",opts:["CO2","H2O","O2","NaCl"],a:1},
    {q:"Chi ha dipinto la Cappella Sistina?",opts:["Leonardo da Vinci","Michelangelo","Raffaello","Botticelli"],a:1},
    {q:"Qual è il simbolo chimico del ferro?",opts:["Fe","Fr","Fi","Fo"],a:0},
    {q:"Quanti secondi ci sono in un'ora?",opts:["360","1800","3600","7200"],a:2},
    {q:"Qual è la moneta dell'Inghilterra?",opts:["Euro","Franco","Sterlina","Corona"],a:2},
    {q:"Qual è la capitale della Francia?",opts:["Lione","Marsiglia","Parigi","Bordeaux"],a:2},
    {q:"Quanti lati ha un esagono?",opts:["5","6","7","8"],a:1},
    {q:"Qual è il pianeta più vicino al Sole?",opts:["Venere","Marte","Mercurio","Terra"],a:2},
    {q:"Chi ha scritto La Divina Commedia?",opts:["Petrarca","Boccaccio","Dante","Manzoni"],a:2},
    {q:"Quanti giorni ha un anno bisestile?",opts:["364","365","366","367"],a:2},
    {q:"A quanti gradi bolle l'acqua?",opts:["90","95","100","110"],a:2},
    {q:"Quante ore ci sono in una settimana?",opts:["148","168","178","188"],a:1},
    {q:"Qual è la velocità della luce (km/s)?",opts:["200.000","300.000","400.000","500.000"],a:1},
    {q:"Chi ha dipinto la Notte Stellata?",opts:["Monet","Picasso","Van Gogh","Dalì"],a:2},
    {q:"Quante zampe ha un insetto?",opts:["4","6","8","10"],a:1},
    {q:"Qual è la capitale della Germania?",opts:["Monaco","Berlino","Amburgo","Francoforte"],a:1},
    {q:"Quanti mesi hanno 31 giorni?",opts:["5","6","7","8"],a:2},
    {q:"Qual è la capitale del Giappone?",opts:["Osaka","Kyoto","Tokyo","Hiroshima"],a:2},
    {q:"Chi ha inventato la lampadina?",opts:["Tesla","Edison","Bell","Marconi"],a:1},
    {q:"Quanti colori ha l'arcobaleno?",opts:["5","6","7","8"],a:2},
    {q:"Qual è la lingua più parlata al mondo?",opts:["Inglese","Spagnolo","Mandarino","Hindi"],a:2},
    {q:"Quanti anni ha un decennio?",opts:["5","8","10","12"],a:2},
    {q:"Chi ha scritto I Promessi Sposi?",opts:["Verga","D'Annunzio","Manzoni","Leopardi"],a:2},
    {q:"Quante ore ci sono in un giorno?",opts:["20","22","24","26"],a:2},
    {q:"Quanti pianeti ha il sistema solare?",opts:["7","8","9","10"],a:1},
    {q:"Chi ha dipinto L'Ultima Cena?",opts:["Raffaello","Michelangelo","Leonardo da Vinci","Caravaggio"],a:2},
    {q:"Qual è la capitale della Spagna?",opts:["Barcellona","Siviglia","Valencia","Madrid"],a:3},
    {q:"Chi ha scritto Romeo e Giulietta?",opts:["Dickens","Shakespeare","Chaucer","Milton"],a:1},
    {q:"Qual è la capitale del Brasile?",opts:["Rio de Janeiro","San Paolo","Brasilia","Salvador"],a:2},
    {q:"Quante settimane ci sono in un anno?",opts:["48","50","52","54"],a:2},
    {q:"Chi ha inventato la stampa?",opts:["Galileo","Gutenberg","Newton","Volta"],a:1},
    {q:"Qual è la capitale del Canada?",opts:["Toronto","Vancouver","Montreal","Ottawa"],a:3},
    {q:"Quante lettere ha l'alfabeto italiano?",opts:["21","23","26","28"],a:0},
    {q:"Chi ha inventato la penicillina?",opts:["Pasteur","Fleming","Curie","Jenner"],a:1},
    {q:"Qual è la capitale dell'Australia?",opts:["Sydney","Melbourne","Brisbane","Canberra"],a:3},
    {q:"Quanti minuti ci sono in un giorno?",opts:["1240","1440","1640","1840"],a:1},
    {q:"Chi ha scritto Don Chisciotte?",opts:["Lope de Vega","Cervantes","Quevedo","Calderón"],a:1},
    {q:"Quanti anni ha un secolo?",opts:["10","50","100","1000"],a:2},
    {q:"Chi ha composto la Quinta Sinfonia?",opts:["Mozart","Bach","Beethoven","Vivaldi"],a:2},
    {q:"Quante facce ha un cubo?",opts:["4","6","8","12"],a:1},
    {q:"Qual è la capitale della Cina?",opts:["Shanghai","Pechino","Guangzhou","Chengdu"],a:1},
    {q:"Chi ha scritto Il Piccolo Principe?",opts:["Camus","Sartre","Saint-Exupéry","Flaubert"],a:2},
    {q:"Qual è la capitale della Russia?",opts:["San Pietroburgo","Kiev","Mosca","Minsk"],a:2},
    {q:"Chi ha inventato il vaccino?",opts:["Pasteur","Fleming","Jenner","Koch"],a:2},
    {q:"Qual è la capitale del Messico?",opts:["Guadalajara","Monterrey","Città del Messico","Puebla"],a:2},
    {q:"Chi ha scritto Moby Dick?",opts:["Twain","Hawthorne","Melville","Poe"],a:2},
    {q:"Quale pianeta ha gli anelli più famosi?",opts:["Giove","Urano","Nettuno","Saturno"],a:3},
    {q:"Chi ha scritto Guerra e Pace?",opts:["Dostoevskij","Gogol","Tolstoj","Turgenev"],a:2},
    {q:"Quanti denti ha un adulto sano?",opts:["28","30","32","34"],a:2},
    {q:"Chi ha inventato il motore a vapore?",opts:["Watt","Edison","Tesla","Bell"],a:0},
    {q:"Qual è la capitale del Portogallo?",opts:["Porto","Coimbra","Lisbona","Braga"],a:2},
    {q:"Chi ha scritto Il Signore degli Anelli?",opts:["Lewis","Tolkien","Rowling","Martin"],a:1},
    {q:"Quante camere ha il cuore umano?",opts:["2","3","4","5"],a:2},
    {q:"Qual è la capitale della Polonia?",opts:["Cracovia","Varsavia","Lodz","Danzica"],a:1},
    {q:"Chi ha scritto Orgoglio e Pregiudizio?",opts:["Brontë","Eliot","Woolf","Austen"],a:3},
    {q:"Chi ha scritto Cento anni di solitudine?",opts:["Borges","Neruda","García Márquez","Vargas Llosa"],a:2},
    {q:"Qual è la capitale della Grecia?",opts:["Salonicco","Patrasso","Creta","Atene"],a:3},
    {q:"Chi ha scritto L'Odissea?",opts:["Sofocle","Euripide","Omero","Eschilo"],a:2},
    {q:"Quale pianeta è più vicino al Sole?",opts:["Venere","Marte","Mercurio","Terra"],a:2},
    {q:"Qual è la capitale della Svezia?",opts:["Oslo","Copenaghen","Helsinki","Stoccolma"],a:3},
    {q:"Qual è il numero Pi greco a 2 decimali?",opts:["3.12","3.14","3.16","3.18"],a:1},
    {q:"Quanti giorni ha febbraio in anno normale?",opts:["27","28","29","30"],a:1},
    {q:"Qual è la capitale della Norvegia?",opts:["Bergen","Stavanger","Trondheim","Oslo"],a:3},
    {q:"Chi ha scritto Il Conte di Montecristo?",opts:["Hugo","Balzac","Dumas","Stendhal"],a:2},
    {q:"Qual è la capitale dell'Austria?",opts:["Salisburgo","Graz","Innsbruck","Vienna"],a:3},
    {q:"Qual è il gas usato nei palloncini?",opts:["Idrogeno","Ossigeno","Elio","Azoto"],a:2},
    {q:"Chi ha scritto Delitto e Castigo?",opts:["Tolstoj","Gogol","Cechov","Dostoevskij"],a:3},
    {q:"Qual è la capitale del Belgio?",opts:["Anversa","Gand","Liegi","Bruxelles"],a:3},
    {q:"Chi ha scritto Frankenstein?",opts:["Shelley","Stoker","Poe","Lovecraft"],a:0},
    {q:"Qual è la capitale della Svizzera?",opts:["Zurigo","Ginevra","Basilea","Berna"],a:3},
    {q:"Chi ha scritto Anna Karenina?",opts:["Pushkin","Tolstoj","Turgenev","Gogol"],a:1},
    {q:"Qual è la capitale della Repubblica Ceca?",opts:["Brno","Ostrava","Praga","Pilsen"],a:2},
    {q:"Chi ha scritto I Miserabili?",opts:["Balzac","Flaubert","Hugo","Zola"],a:2},
    {q:"Qual è la capitale della Danimarca?",opts:["Aarhus","Odense","Copenaghen","Aalborg"],a:2},
    {q:"Chi ha scritto Il Gattopardo?",opts:["Pavese","Calvino","Lampedusa","Moravia"],a:2},
    {q:"Qual è la capitale dell'Ungheria?",opts:["Debrecen","Miskolc","Pécs","Budapest"],a:3},
    {q:"Chi ha scritto Ulisse?",opts:["Woolf","Lawrence","Joyce","Eliot"],a:2},
    {q:"Chi ha scritto Il Vecchio e il Mare?",opts:["Steinbeck","Faulkner","Hemingway","Fitzgerald"],a:2},
    {q:"Qual è la capitale della Finlandia?",opts:["Tampere","Turku","Oulu","Helsinki"],a:3},
    {q:"Chi ha scritto L'Alchimista?",opts:["Saramago","Amado","Coelho","Pessoa"],a:2},
    {q:"Qual è la capitale dell'Irlanda?",opts:["Cork","Galway","Limerick","Dublino"],a:3},
    {q:"Chi ha scritto Pinocchio?",opts:["Salgari","De Amicis","Collodi","Rodari"],a:2},
    {q:"Chi ha inventato il World Wide Web?",opts:["Gates","Jobs","Berners-Lee","Zuckerberg"],a:2},
    {q:"Chi ha fondato Microsoft?",opts:["Jobs","Gates","Zuckerberg","Brin"],a:1},
    {q:"Chi ha fondato Apple?",opts:["Gates","Zuckerberg","Jobs","Bezos"],a:2},
    {q:"Chi ha fondato Facebook?",opts:["Jobs","Gates","Musk","Zuckerberg"],a:3},
    {q:"Chi ha fondato Amazon?",opts:["Musk","Gates","Bezos","Zuckerberg"],a:2},
    {q:"Chi ha fondato Google?",opts:["Gates e Allen","Jobs e Wozniak","Page e Brin","Zuckerberg e Moskovitz"],a:2},
    {q:"Chi ha fondato SpaceX?",opts:["Jobs","Gates","Bezos","Musk"],a:3},
    {q:"Qual è il simbolo olimpico?",opts:["5 anelli colorati","Torcia","Colomba","Medaglia"],a:0},
    {q:"Ogni quanti anni si svolgono le Olimpiadi estive?",opts:["2","3","4","5"],a:2},
    {q:"Qual è la superficie terrestre coperta da acqua?",opts:["51%","61%","71%","81%"],a:2},
    {q:"Qual è il continente più grande?",opts:["Africa","Asia","America","Europa"],a:1},
    {q:"Qual è il tipo di sangue universale donatore?",opts:["A","B","AB","0"],a:3},
    {q:"Qual è il tipo di sangue universale ricevente?",opts:["A","B","AB","0"],a:2},
    {q:"Qual è il numero Romano per 50?",opts:["X","L","C","D"],a:1},
    {q:"Qual è il numero Romano per 100?",opts:["X","L","C","D"],a:2},
    {q:"Quante righe ha una scacchiera?",opts:["6","7","8","9"],a:2},
    {q:"Qual è il pezzo più potente negli scacchi?",opts:["Re","Regina","Torre","Alfiere"],a:1},
    {q:"Quanti semi ha un mazzo di carte?",opts:["2","3","4","5"],a:2},
    {q:"Quante carte ha un mazzo francese?",opts:["36","40","48","52"],a:3},
  ],
  storia: [
    {q:"In quale anno è caduto il Muro di Berlino?",opts:["1987","1989","1991","1993"],a:1},
    {q:"In quale anno è scoppiata la Prima Guerra Mondiale?",opts:["1912","1914","1916","1918"],a:1},
    {q:"Chi era il faraone durante la costruzione delle piramidi?",opts:["Ramses II","Tutankhamon","Cheope","Nefertiti"],a:2},
    {q:"In quale anno Colombo scoprì l'America?",opts:["1488","1490","1492","1498"],a:2},
    {q:"Chi era il primo presidente degli Stati Uniti?",opts:["Lincoln","Jefferson","Franklin","Washington"],a:3},
    {q:"In quale anno è finita la Seconda Guerra Mondiale?",opts:["1943","1944","1945","1946"],a:2},
    {q:"L'Impero Romano d'Occidente cadde nel:",opts:["376","476","576","676"],a:1},
    {q:"Chi fu il primo uomo a camminare sulla Luna?",opts:["Aldrin","Gagarin","Armstrong","Glenn"],a:2},
    {q:"La Rivoluzione Francese iniziò nel:",opts:["1776","1783","1789","1799"],a:2},
    {q:"In quale anno fu firmata la Magna Carta?",opts:["1115","1215","1315","1415"],a:1},
    {q:"Chi guidò la Rivoluzione Russa del 1917?",opts:["Stalin","Trotsky","Lenin","Krusciov"],a:2},
    {q:"In quale anno fu lanciata la bomba su Hiroshima?",opts:["1943","1944","1945","1946"],a:2},
    {q:"Chi fu il primo imperatore romano?",opts:["Cesare","Augusto","Nerone","Caligola"],a:1},
    {q:"In quale anno iniziò la Seconda Guerra Mondiale?",opts:["1937","1938","1939","1940"],a:2},
    {q:"In quale anno fu assassinato Abraham Lincoln?",opts:["1861","1863","1865","1867"],a:2},
    {q:"La Rivoluzione Americana avvenne nel:",opts:["1774","1776","1778","1780"],a:1},
    {q:"Chi era il leader della Germania nazista?",opts:["Mussolini","Franco","Hitler","Hirohito"],a:2},
    {q:"In quale anno fu fondata Roma?",opts:["553 a.C.","653 a.C.","753 a.C.","853 a.C."],a:2},
    {q:"In quale anno cadde Costantinopoli?",opts:["1253","1353","1453","1553"],a:2},
    {q:"La Guerra dei Cent'anni iniziò nel:",opts:["1237","1337","1437","1537"],a:1},
    {q:"Chi scoprì la rotta marittima per le Indie?",opts:["Colombo","Vespucci","Vasco da Gama","Magellano"],a:2},
    {q:"Chi era il re di Francia durante la Rivoluzione?",opts:["Luigi XIV","Luigi XV","Luigi XVI","Luigi XVII"],a:2},
    {q:"Chi fondò l'impero mongolo?",opts:["Kublai Khan","Tamerlano","Gengis Khan","Hulagu"],a:2},
    {q:"Chi guidò la conquista del Messico per la Spagna?",opts:["Pizarro","Cortés","Balboa","Alvarado"],a:1},
    {q:"Chi guidò la rivolta degli schiavi romani?",opts:["Crasso","Spartaco","Mario","Silla"],a:1},
    {q:"Quale imperatore romano adottò il Cristianesimo?",opts:["Nerone","Diocleziano","Costantino","Teodosio"],a:2},
    {q:"Chi era il re spartano alle Termopili?",opts:["Leonida","Pausania","Cleomene","Agesilao"],a:0},
    {q:"Chi guidò i Cartaginesi contro Roma?",opts:["Amilcare","Asdrubale","Annibale","Magone"],a:2},
    {q:"Chi fondò l'Impero carolingio?",opts:["Pipino","Carlo Martello","Carlo Magno","Ludovico"],a:2},
    {q:"Chi fu il primo re d'Italia unita?",opts:["Garibaldi","Cavour","Vittorio Emanuele II","Mazzini"],a:2},
    {q:"In quale anno fu proclamato il Regno d'Italia?",opts:["1859","1860","1861","1862"],a:2},
    {q:"Chi guidò la spedizione dei Mille?",opts:["Cavour","Mazzini","Garibaldi","Vittorio Emanuele"],a:2},
    {q:"In quale anno fu proclamato l'Impero tedesco?",opts:["1869","1870","1871","1872"],a:2},
    {q:"In quale anno iniziò la Guerra Civile americana?",opts:["1859","1860","1861","1862"],a:2},
    {q:"In quale anno finì la Guerra Civile americana?",opts:["1863","1864","1865","1866"],a:2},
    {q:"Chi costruì il Colosseo di Roma?",opts:["Augusto","Nerone","Vespasiano","Domiziano"],a:2},
    {q:"Chi era il filosofo maestro di Alessandro Magno?",opts:["Platone","Socrate","Aristotele","Epicuro"],a:2},
    {q:"Chi guidò la resistenza francese nella WWII?",opts:["Pétain","Darlan","de Gaulle","Giraud"],a:2},
    {q:"In quale anno avvenne lo sbarco in Normandia?",opts:["1943","1944","1945","1946"],a:1},
    {q:"Chi fu il primo ministro britannico durante la WWII?",opts:["Chamberlain","Eden","Attlee","Churchill"],a:3},
    {q:"In quale anno iniziò la Guerra di Corea?",opts:["1948","1950","1952","1954"],a:1},
    {q:"In quale anno fu fondata la NATO?",opts:["1947","1949","1951","1953"],a:1},
    {q:"In quale anno fu fondata l'ONU?",opts:["1943","1944","1945","1946"],a:2},
    {q:"Chi guidò il movimento per i diritti civili negli USA?",opts:["Malcolm X","Kennedy","Luther King","Parks"],a:2},
    {q:"In quale anno fu costruita la Torre Eiffel?",opts:["1884","1887","1889","1891"],a:2},
    {q:"Chi guidò la Rivoluzione Cubana?",opts:["Guevara","Castro","Batista","Allende"],a:1},
    {q:"In quale anno cadde il regime sovietico?",opts:["1989","1990","1991","1992"],a:2},
    {q:"In quale anno finì la WWI?",opts:["1917","1918","1919","1920"],a:1},
    {q:"Chi era il dittatore spagnolo del XX secolo?",opts:["Primo de Rivera","Mola","Franco","Queipo"],a:2},
    {q:"In quale anno iniziò la Guerra Civile Spagnola?",opts:["1934","1935","1936","1937"],a:2},
    {q:"Chi vinse la Battaglia di Stalingrado?",opts:["Tedeschi","Italiani","Russi","Rumeni"],a:2},
    {q:"In quale anno avvenne l'attacco a Pearl Harbor?",opts:["1940","1941","1942","1943"],a:1},
    {q:"Chi guidò il Giappone durante la WWII?",opts:["Hirohito","Tojo","Yamamoto","Suzuki"],a:0},
    {q:"Chi fu il primo presidente della Repubblica Italiana?",opts:["De Gasperi","Togliatti","Einaudi","Nenni"],a:2},
    {q:"In quale anno fu proclamata la Repubblica Italiana?",opts:["1945","1946","1947","1948"],a:1},
    {q:"In quale anno fu liberato Nelson Mandela?",opts:["1988","1989","1990","1991"],a:2},
    {q:"Chi guidò la conquista del Perù per la Spagna?",opts:["Cortés","Balboa","Pizarro","Almagro"],a:2},
    {q:"In quale anno fu distrutta Pompei?",opts:["69","79","89","99"],a:1},
    {q:"Chi fu il primo astronauta a orbitare la Terra?",opts:["Armstrong","Shepard","Glenn","Gagarin"],a:3},
    {q:"In quale anno Gagarin orbitò la Terra?",opts:["1959","1960","1961","1962"],a:2},
    {q:"In quale anno fu assassinato Kennedy?",opts:["1961","1962","1963","1964"],a:2},
    {q:"Chi guidò la marcia su Roma?",opts:["Grandi","Mussolini","Balbo","Farinacci"],a:1},
    {q:"In quale anno avvenne la marcia su Roma?",opts:["1920","1921","1922","1923"],a:2},
    {q:"Chi guidò la Lunga Marcia in Cina?",opts:["Zhou Enlai","Deng","Mao","Zhu De"],a:2},
    {q:"In quale anno fu dichiarata l'indipendenza dell'India?",opts:["1945","1946","1947","1948"],a:2},
    {q:"Chi era il leader dell'indipendenza indiana?",opts:["Nehru","Bose","Gandhi","Jinnah"],a:2},
    {q:"In quale anno finì la Guerra del Vietnam?",opts:["1973","1974","1975","1976"],a:2},
    {q:"Chi guidò la Riforma Protestante?",opts:["Calvino","Zuinglio","Lutero","Erasmo"],a:2},
    {q:"In quale anno Lutero affisse le 95 tesi?",opts:["1515","1517","1519","1521"],a:1},
    {q:"In quale anno iniziò la Guerra Fredda?",opts:["1945","1946","1947","1948"],a:2},
    {q:"Quale evento segnò l'inizio della WWI?",opts:["Invasione Serbia","Assassinio di Sarajevo","Dichiarazione guerra Austria","Mobilitazione Russia"],a:1},
    {q:"In quale anno fu invasa la Polonia dalla Germania?",opts:["1938","1939","1940","1941"],a:1},
    {q:"Chi vinse la Battaglia di Midway?",opts:["Giapponesi","Americani","Britannici","Australiani"],a:1},
    {q:"In quale anno cadde il regime fascista in Italia?",opts:["1942","1943","1944","1945"],a:1},
    {q:"Chi vinse la Battaglia di Lepanto?",opts:["Turchi","Veneziani","Spagnoli","Alleati cristiani"],a:3},
    {q:"In quale anno fu firmato il Trattato di Versailles?",opts:["1917","1918","1919","1920"],a:2},
    {q:"In quale anno fu firmato il Patto di Varsavia?",opts:["1953","1955","1957","1959"],a:1},
    {q:"Chi fondò il Partito Comunista Cinese?",opts:["Mao","Zhou Enlai","Deng","Liu Shaoqi"],a:0},
    {q:"In quale anno fu fondato il Partito Nazista?",opts:["1918","1919","1920","1921"],a:2},
    {q:"In quale anno Stalin salì al potere?",opts:["1922","1924","1927","1929"],a:1},
    {q:"In quale anno fu abolita la schiavitù negli USA?",opts:["1861","1863","1865","1867"],a:2},
    {q:"Chi vinse la Battaglia di Trafalgar?",opts:["Napoleone","Villeneuve","Nelson","Collingwood"],a:2},
    {q:"In quale anno avvenne la Battaglia di Trafalgar?",opts:["1803","1805","1807","1809"],a:1},
    {q:"Chi fu l'ultimo zar di Russia?",opts:["Alessandro II","Alessandro III","Nicola I","Nicola II"],a:3},
    {q:"In quale anno avvenne la rivoluzione d'Ottobre in Russia?",opts:["1915","1916","1917","1918"],a:2},
    {q:"In quale anno fu costruito il Muro di Berlino?",opts:["1957","1959","1961","1963"],a:2},
    {q:"In quale anno avvenne la primavera di Praga?",opts:["1965","1966","1967","1968"],a:3},
    {q:"In quale anno nacque Solidarnosc in Polonia?",opts:["1978","1979","1980","1981"],a:2},
    {q:"Chi guidò la Rivoluzione Islamica in Iran?",opts:["Shah Pahlavi","Khomeini","Rafsanjani","Khamenei"],a:1},
    {q:"In quale anno avvenne la Rivoluzione Islamica in Iran?",opts:["1977","1978","1979","1980"],a:2},
    {q:"In quale anno l'Iraq invase il Kuwait?",opts:["1988","1989","1990","1991"],a:2},
    {q:"In quale anno gli USA invasero l'Iraq?",opts:["2001","2002","2003","2004"],a:2},
    {q:"In quale anno avvennero gli attentati dell'11 settembre?",opts:["1999","2000","2001","2002"],a:2},
    {q:"In quale anno l'URSS invase l'Afghanistan?",opts:["1977","1978","1979","1980"],a:2},
    {q:"In quale anno fu fondato lo Stato d'Israele?",opts:["1946","1947","1948","1949"],a:2},
    {q:"In quale anno avvenne la Guerra dei Sei Giorni?",opts:["1965","1966","1967","1968"],a:2},
    {q:"In quale anno avvenne la crisi dei missili di Cuba?",opts:["1960","1961","1962","1963"],a:2},
    {q:"In quale anno fu scoperta la tomba di Tutankhamon?",opts:["1918","1920","1922","1924"],a:2},
    {q:"In quale anno avvenne la Battaglia di Waterloo?",opts:["1813","1814","1815","1816"],a:2},
    {q:"Chi era il Kaiser tedesco durante la WWI?",opts:["Guglielmo I","Federico III","Guglielmo II","Carlo"],a:2},
    {q:"In quale anno avvenne la rivolta dei Boxer in Cina?",opts:["1898","1900","1902","1904"],a:1},
    {q:"In quale anno avvenne il genocidio in Rwanda?",opts:["1992","1993","1994","1995"],a:2},
    {q:"In quale anno crollarono le Torri Gemelle?",opts:["1999","2000","2001","2002"],a:2},
    {q:"Quale organizzazione effettuò gli attentati dell'11 settembre?",opts:["Hamas","Hezbollah","Al-Qaeda","ISIS"],a:2},
    {q:"In quale anno fu ucciso Bin Laden?",opts:["2009","2010","2011","2012"],a:2},
    {q:"In quale anno iniziò la Primavera Araba?",opts:["2009","2010","2011","2012"],a:1},
    {q:"In quale anno fu ucciso Gheddafi?",opts:["2010","2011","2012","2013"],a:1},
    {q:"In quale anno iniziò la guerra civile in Siria?",opts:["2010","2011","2012","2013"],a:1},
  ],
  geografia: [
    {q:"Qual è la capitale dell'Australia?",opts:["Sydney","Melbourne","Canberra","Brisbane"],a:2},
    {q:"In quale paese si trova il Monte Everest?",opts:["India","Nepal","Pakistan","Cina"],a:1},
    {q:"Qual è l'oceano più grande del mondo?",opts:["Atlantico","Indiano","Artico","Pacifico"],a:3},
    {q:"Qual è il fiume più lungo del mondo?",opts:["Nilo","Amazzonia","Mississippi","Yangtze"],a:0},
    {q:"In quale continente si trova il Sahara?",opts:["Asia","Africa","Australia","America del Sud"],a:1},
    {q:"Qual è la capitale del Brasile?",opts:["Rio de Janeiro","San Paolo","Brasilia","Salvador"],a:2},
    {q:"Qual è il paese più grande del mondo?",opts:["Canada","USA","Cina","Russia"],a:3},
    {q:"In quale paese si trova Machu Picchu?",opts:["Messico","Brasile","Perù","Colombia"],a:2},
    {q:"Qual è la capitale del Canada?",opts:["Toronto","Vancouver","Ottawa","Montreal"],a:2},
    {q:"Qual è il lago più profondo del mondo?",opts:["Lago Superiore","Lago Baikal","Lago Titicaca","Lago Vittoria"],a:1},
    {q:"In quale paese si trova Angkor Wat?",opts:["Tailandia","Vietnam","Cambogia","Myanmar"],a:2},
    {q:"Quanti stati ha gli USA?",opts:["48","49","50","52"],a:2},
    {q:"Qual è il deserto più grande del mondo?",opts:["Sahara","Gobi","Arabico","Antartico"],a:3},
    {q:"Qual è la montagna più alta d'Africa?",opts:["Monte Kenya","Kilimanjaro","Ruwenzori","Elgon"],a:1},
    {q:"Qual è la capitale dell'Argentina?",opts:["Santiago","Lima","Buenos Aires","Montevideo"],a:2},
    {q:"Qual è la capitale del Perù?",opts:["Cuzco","Arequipa","Lima","Trujillo"],a:2},
    {q:"Qual è il paese più piccolo del mondo?",opts:["Monaco","San Marino","Liechtenstein","Vaticano"],a:3},
    {q:"Qual è la capitale del Cile?",opts:["Valparaíso","Concepción","Santiago","Antofagasta"],a:2},
    {q:"Qual è il fiume più lungo d'Europa?",opts:["Danubio","Reno","Volga","Don"],a:2},
    {q:"Qual è la capitale della Colombia?",opts:["Medellín","Cali","Barranquilla","Bogotà"],a:3},
    {q:"Qual è la capitale del Venezuela?",opts:["Maracaibo","Valencia","Barquisimeto","Caracas"],a:3},
    {q:"Qual è il lago più grande del mondo?",opts:["Mar Caspio","Lago Superiore","Lago Vittoria","Lago Baikal"],a:0},
    {q:"Qual è la capitale dell'Ecuador?",opts:["Guayaquil","Cuenca","Ambato","Quito"],a:3},
    {q:"Qual è la capitale della Bolivia (sede gov.)?",opts:["Sucre","La Paz","Cochabamba","Santa Cruz"],a:1},
    {q:"Qual è il monte più alto delle Alpi?",opts:["Monte Rosa","Gran Paradiso","Monte Bianco","Cervino"],a:2},
    {q:"Qual è la capitale dell'Uruguay?",opts:["Salto","Paysandú","Rivera","Montevideo"],a:3},
    {q:"In quale paese si trova il Canale di Suez?",opts:["Israele","Giordania","Egitto","Libia"],a:2},
    {q:"Qual è la capitale del Paraguay?",opts:["Ciudad del Este","Encarnación","Asunción","Concepción"],a:2},
    {q:"Qual è il fiume più lungo d'Italia?",opts:["Tevere","Adige","Arno","Po"],a:3},
    {q:"Qual è la capitale della Nuova Zelanda?",opts:["Auckland","Hamilton","Wellington","Christchurch"],a:2},
    {q:"In quale paese si trova il Canale di Panama?",opts:["Colombia","Costa Rica","Panama","Nicaragua"],a:2},
    {q:"Qual è la capitale delle Filippine?",opts:["Cebu","Davao","Quezon City","Manila"],a:3},
    {q:"Qual è il monte più alto d'Europa?",opts:["Monte Bianco","Monte Rosa","Elbrus","Monte Cervino"],a:2},
    {q:"Qual è la capitale dell'Indonesia?",opts:["Surabaya","Bandung","Medan","Giacarta"],a:3},
    {q:"Qual è il monte più alto delle Americhe?",opts:["McKinley","Aconcagua","Logan","Ojos del Salado"],a:1},
    {q:"Qual è la capitale della Tailandia?",opts:["Chiang Mai","Phuket","Pattaya","Bangkok"],a:3},
    {q:"Qual è la capitale del Vietnam?",opts:["Ho Chi Minh City","Da Nang","Hue","Hanoi"],a:3},
    {q:"Qual è il monte più alto dell'Asia?",opts:["K2","Kangchenjunga","Lhotse","Everest"],a:3},
    {q:"Qual è la capitale della Corea del Sud?",opts:["Busan","Incheon","Daegu","Seul"],a:3},
    {q:"Qual è la capitale della Cambogia?",opts:["Siem Reap","Battambang","Sihanoukville","Phnom Penh"],a:3},
    {q:"Qual è l'isola più grande del mondo?",opts:["Borneo","Groenlandia","Nuova Guinea","Madagascar"],a:1},
    {q:"Qual è la capitale del Myanmar?",opts:["Rangoon","Mandalay","Naypyidaw","Bago"],a:2},
    {q:"Qual è la capitale del Bangladesh?",opts:["Chittagong","Khulna","Rajshahi","Dhaka"],a:3},
    {q:"Qual è il lago più grande d'Africa?",opts:["Lago Tanganica","Lago Malawi","Lago Vittoria","Lago Turkana"],a:2},
    {q:"Qual è la capitale del Nepal?",opts:["Pokhara","Biratnagar","Lalitpur","Kathmandu"],a:3},
    {q:"Qual è il deserto più grande dell'Asia?",opts:["Taklamakan","Karakum","Gobi","Thar"],a:2},
    {q:"Qual è la capitale del Pakistan?",opts:["Karachi","Lahore","Peshawar","Islamabad"],a:3},
    {q:"Qual è il golfo tra Arabia e Iran?",opts:["Golfo di Aden","Mar Rosso","Golfo Persico","Mar Arabico"],a:2},
    {q:"Qual è la capitale dell'Arabia Saudita?",opts:["La Mecca","Medina","Gedda","Riad"],a:3},
    {q:"Qual è lo stretto tra l'Europa e l'Africa?",opts:["Stretto di Sicilia","Stretto di Messina","Stretto di Gibilterra","Stretto di Otranto"],a:2},
    {q:"Qual è la capitale degli Emirati Arabi Uniti?",opts:["Dubai","Sharjah","Abu Dhabi","Al Ain"],a:2},
    {q:"Qual è il fiume più lungo dell'Africa?",opts:["Congo","Nilo","Zambesi","Niger"],a:1},
    {q:"Qual è la capitale del Sudafrica?",opts:["Johannesburg","Città del Capo","Durban","Pretoria"],a:3},
    {q:"Qual è la capitale del Kenya?",opts:["Mombasa","Kisumu","Eldoret","Nairobi"],a:3},
    {q:"Qual è il fiume più lungo del Nord America?",opts:["Colorado","Missouri","Ohio","Mississippi"],a:3},
    {q:"Qual è la capitale del Marocco?",opts:["Casablanca","Marrakech","Fes","Rabat"],a:3},
    {q:"Qual è il punto più basso della Terra?",opts:["Valle della Morte","Mar Morto","Fossa delle Marianne","Lake Assal"],a:2},
    {q:"Qual è la capitale dell'Algeria?",opts:["Orano","Costantina","Annaba","Algeri"],a:3},
    {q:"Qual è la capitale della Nigeria?",opts:["Lagos","Kano","Ibadan","Abuja"],a:3},
    {q:"Qual è lo stretto tra Alaska e Russia?",opts:["Stretto di Davis","Stretto di Drake","Stretto di Bering","Stretto di Hudson"],a:2},
    {q:"Qual è la capitale dell'Etiopia?",opts:["Dire Dawa","Gondar","Addis Abeba","Mekele"],a:2},
    {q:"Qual è la penisola più grande del mondo?",opts:["Iberica","Arabica","Indiana","Scandinava"],a:1},
    {q:"Qual è la capitale della Tanzania?",opts:["Dar es Salaam","Zanzibar","Dodoma","Arusha"],a:2},
    {q:"Qual è il mare tra l'Italia e la Croazia?",opts:["Mar Tirreno","Mar Ionio","Mar Adriatico","Mar Ligure"],a:2},
    {q:"Qual è la capitale del Ghana?",opts:["Kumasi","Tamale","Sekondi","Accra"],a:3},
    {q:"Qual è la capitale del Senegal?",opts:["Dakar","Thiès","Saint-Louis","Kaolack"],a:0},
    {q:"Qual è il mare tra la Grecia e la Turchia?",opts:["Mar Ionio","Mar di Creta","Mar Egeo","Mar di Marmara"],a:2},
    {q:"Qual è la capitale del Congo (Rep. Dem.)?",opts:["Lubumbashi","Mbuji-Mayi","Kisangani","Kinshasa"],a:3},
    {q:"Quale paese ha più isole al mondo?",opts:["Indonesia","Filippine","Norvegia","Svezia"],a:2},
    {q:"Qual è la capitale dello Zambia?",opts:["Ndola","Kitwe","Lusaka","Livingstone"],a:2},
    {q:"Qual è la capitale dello Zimbabwe?",opts:["Bulawayo","Mutare","Gweru","Harare"],a:3},
    {q:"Qual è la capitale del Mozambico?",opts:["Beira","Nampula","Quelimane","Maputo"],a:3},
    {q:"Quale paese è sia in Europa che in Asia?",opts:["Georgia","Armenia","Kazakistan","Russia"],a:3},
    {q:"Qual è la capitale dell'Angola?",opts:["Lobito","Benguela","Huambo","Luanda"],a:3},
    {q:"Qual è il lago più grande d'Europa?",opts:["Lago Ladoga","Lago Onega","Lago Vänern","Lago di Ginevra"],a:0},
    {q:"Qual è il lago più grande d'Italia?",opts:["Lago di Como","Lago di Garda","Lago Maggiore","Lago di Bracciano"],a:1},
    {q:"Quale fiume attraversa Parigi?",opts:["Loire","Loira","Senna","Rodano"],a:2},
    {q:"Quale fiume attraversa Londra?",opts:["Severn","Avon","Tamigi","Trent"],a:2},
    {q:"Quale fiume attraversa Roma?",opts:["Arno","Po","Tevere","Adige"],a:2},
    {q:"Quale fiume attraversa Il Cairo?",opts:["Congo","Niger","Nilo","Zambesi"],a:2},
    {q:"Quale fiume attraversa Budapest?",opts:["Tisa","Drava","Sava","Danubio"],a:3},
    {q:"Quale fiume attraversa Vienna?",opts:["Inn","Mur","Enns","Danubio"],a:3},
    {q:"Quale catena montuosa separa Europa e Asia?",opts:["Caucaso","Urali","Carpazi","Alpi"],a:1},
    {q:"Quale catena montuosa si trova tra Francia e Spagna?",opts:["Alpi","Apennini","Pirenei","Cantabrici"],a:2},
    {q:"Quale monte si trova al confine tra Francia e Italia?",opts:["Monte Rosa","Cervino","Monte Bianco","Gran Paradiso"],a:2},
    {q:"Quale paese è attraversato dall'equatore?",opts:["Colombia","Brasile","Ecuador","Tutti e tre"],a:3},
    {q:"Quale paese ha più vulcani attivi?",opts:["Giappone","Indonesia","Filippine","USA"],a:1},
    {q:"Quale catena montuosa si trova in America del Sud?",opts:["Appalachi","Rocky Mountains","Andes","Sierra Madre"],a:2},
    {q:"Qual è la capitale delle Maldive?",opts:["Addu","Fuvahmulah","Kulhudhuffushi","Malé"],a:3},
    {q:"Quale fiume scorre attraverso l'Amazzonia?",opts:["Orinoco","Paraná","Rio delle Amazzoni","Paraguay"],a:2},
    {q:"Qual è la capitale del Costa Rica?",opts:["Alajuela","Cartago","Heredia","San José"],a:3},
    {q:"Qual è la capitale del Guatemala?",opts:["Quetzaltenango","Huehuetenango","Escuintla","Città del Guatemala"],a:3},
    {q:"Quale paese è chiamato il Tetto del Mondo?",opts:["Nepal","Tibet","India","Bhutan"],a:1},
    {q:"Qual è la capitale del Panama?",opts:["Colón","David","La Chorrera","Panama City"],a:3},
    {q:"Quante regioni ha l'Italia?",opts:["18","19","20","21"],a:2},
    {q:"Qual è il capoluogo della Sicilia?",opts:["Catania","Siracusa","Agrigento","Palermo"],a:3},
    {q:"Qual è il capoluogo della Sardegna?",opts:["Sassari","Nuoro","Oristano","Cagliari"],a:3},
    {q:"Qual è il capoluogo della Lombardia?",opts:["Bergamo","Brescia","Como","Milano"],a:3},
    {q:"Qual è il capoluogo della Toscana?",opts:["Pisa","Siena","Livorno","Firenze"],a:3},
    {q:"Qual è il capoluogo del Veneto?",opts:["Padova","Verona","Vicenza","Venezia"],a:3},
    {q:"Qual è la montagna più alta d'Italia?",opts:["Gran Paradiso","Monte Rosa","Monte Bianco","Ortles"],a:2},
    {q:"Qual è la capitale della Somalia?",opts:["Hargeisa","Kismayo","Bosaso","Mogadiscio"],a:3},
    {q:"Qual è la capitale del Madagascar?",opts:["Toamasina","Fianarantsoa","Mahajanga","Antananarivo"],a:3},
    {q:"Qual è la capitale di Cuba?",opts:["Santiago de Cuba","Camagüey","Holguín","L'Avana"],a:3},
    {q:"Qual è la capitale della Giamaica?",opts:["Montego Bay","Ocho Rios","Negril","Kingston"],a:3},
    {q:"Qual è la capitale di Haiti?",opts:["Cap-Haïtien","Gonaïves","Les Cayes","Port-au-Prince"],a:3},
    {q:"Qual è la capitale della Repubblica Dominicana?",opts:["Santiago","La Vega","San Pedro","Santo Domingo"],a:3},
    {q:"Quale stretto separa l'Italia dalla Sicilia?",opts:["Stretto di Sicilia","Stretto di Messina","Stretto di Otranto","Stretto di Gibilterra"],a:1},
    {q:"Quale mare si trova tra Italia e Grecia?",opts:["Mar Tirreno","Mar Adriatico","Mar Ionio","Mar Egeo"],a:2},
    {q:"Qual è la capitale dell'Honduras?",opts:["San Pedro Sula","La Ceiba","Tegucigalpa","Choloma"],a:2},
    {q:"Qual è la capitale di El Salvador?",opts:["Santa Ana","San Miguel","Soyapango","San Salvador"],a:3},
    {q:"Qual è la capitale del Nicaragua?",opts:["León","Granada","Matagalpa","Managua"],a:3},
    {q:"Quale fiume attraversa Berlino?",opts:["Elba","Oder","Reno","Sprea"],a:3},
    {q:"Quale fiume attraversa Mosca?",opts:["Volga","Don","Neva","Moscova"],a:3},
    {q:"Quale fiume attraversa Praga?",opts:["Oder","Elba","Moldava","Moravia"],a:2},
    {q:"Quale fiume attraversa Varsavia?",opts:["Oder","Vistola","Bug","San"],a:1},
    {q:"Quale fiume attraversa Madrid?",opts:["Ebro","Tago","Manzanares","Guadalquivir"],a:2},
    {q:"Quale fiume attraversa Lisbona?",opts:["Douro","Minho","Tago","Guadiana"],a:2},
  ],
  sport: [
    {q:"In quale paese sono nati i Giochi Olimpici?",opts:["Italia","Grecia","Egitto","Turchia"],a:1},
    {q:"Quante squadre partecipano alla NBA?",opts:["28","30","32","34"],a:1},
    {q:"Qual è la distanza ufficiale di una maratona?",opts:["40 km","41,5 km","42,195 km","43 km"],a:2},
    {q:"In quale sport si usa il termine love?",opts:["Golf","Tennis","Badminton","Squash"],a:1},
    {q:"Quanti giocatori ci sono in una squadra di pallavolo?",opts:["5","6","7","8"],a:1},
    {q:"Quale paese ha vinto più Coppe del Mondo di calcio?",opts:["Germania","Argentina","Brasile","Italia"],a:2},
    {q:"Quanto dura una partita di basket NBA?",opts:["40 min","44 min","48 min","60 min"],a:2},
    {q:"In quale sport si compete per la Coppa Davis?",opts:["Golf","Tennis","Nuoto","Scherma"],a:1},
    {q:"Quante buche ha un campo da golf standard?",opts:["9","12","18","24"],a:2},
    {q:"In quale sport si usano strike e spare?",opts:["Baseball","Bowling","Cricket","Softball"],a:1},
    {q:"Chi è il velocista con il record mondiale dei 100m?",opts:["Carl Lewis","Usain Bolt","Maurice Greene","Tyson Gay"],a:1},
    {q:"Quanti giocatori ci sono in campo nel football americano?",opts:["9","10","11","12"],a:2},
    {q:"In quale anno fu fondata la FIFA?",opts:["1900","1904","1908","1912"],a:1},
    {q:"Chi ha vinto più titoli del Grande Slam nel tennis maschile?",opts:["Federer","Nadal","Djokovic","Sampras"],a:2},
    {q:"Quante squadre ci sono in Serie A italiana?",opts:["16","18","20","22"],a:2},
    {q:"Chi ha vinto più Mondiali di F1?",opts:["Schumacher","Hamilton","Vettel","Senna"],a:1},
    {q:"In quale sport si usa il puck?",opts:["Baseball","Hockey su ghiaccio","Curling","Lacrosse"],a:1},
    {q:"Chi ha vinto più Mondiali di ciclismo?",opts:["Merckx","Hinault","Indurain","Contador"],a:0},
    {q:"In quale sport si gareggia per la Ryder Cup?",opts:["Tennis","Golf","Cricket","Polo"],a:1},
    {q:"Chi ha vinto più Slam nel tennis femminile?",opts:["Navratilova","Graf","Williams S.","Evert"],a:2},
    {q:"Quanti giocatori ci sono in una squadra di cricket?",opts:["9","10","11","12"],a:2},
    {q:"In quale sport si usa il termine birdie?",opts:["Tennis","Badminton","Golf","Cricket"],a:2},
    {q:"Chi ha vinto più Tour de France?",opts:["Merckx","Armstrong","Hinault","Indurain"],a:1},
    {q:"In quale sport si usa il termine try?",opts:["Football americano","Rugby","Entrambi","Cricket"],a:1},
    {q:"Chi ha segnato più gol nella storia del calcio?",opts:["Pelé","Messi","Ronaldo C.","Romario"],a:2},
    {q:"Quante discipline ci sono nel decathlon?",opts:["8","9","10","11"],a:2},
    {q:"Chi ha vinto più titoli NBA?",opts:["Jordan","James","Bryant","Russell"],a:3},
    {q:"In quale sport si usa il termine ippon?",opts:["Karate","Judo","Entrambi","Taekwondo"],a:2},
    {q:"Chi ha vinto più titoli Wimbledon maschili?",opts:["Federer","Sampras","Djokovic","McEnroe"],a:0},
    {q:"Quante corsie ha una piscina olimpica?",opts:["6","7","8","9"],a:2},
    {q:"Chi ha vinto più Mondiali di sci alpino?",opts:["Stenmark","Tomba","Vonn","Maze"],a:0},
    {q:"Chi è stato il primo calciatore a vincere 5 Palloni d'Oro?",opts:["Zidane","Ronaldo B.","Messi","Ronaldo C."],a:2},
    {q:"Quante discipline ci sono nel triathlon olimpico?",opts:["2","3","4","5"],a:1},
    {q:"Chi ha detenuto il record del salto in lungo?",opts:["Lewis","Powell","Beamon","Johnson"],a:2},
    {q:"Quante squadre ci sono in Bundesliga?",opts:["16","18","20","22"],a:1},
    {q:"Chi detiene il record mondiale nel salto con l'asta?",opts:["Bubka","Lavillenie","Duplantis","Hooker"],a:2},
    {q:"Quanti punti vale una meta nel rugby?",opts:["3","4","5","6"],a:2},
    {q:"Chi ha vinto più ori olimpici nel nuoto?",opts:["Spitz","Phelps","Biondi","Popov"],a:1},
    {q:"Chi ha vinto più ori olimpici nella ginnastica?",opts:["Comăneci","Khorkina","Latynina","Comaneci"],a:2},
    {q:"Quante squadre partecipano ai Mondiali di calcio?",opts:["24","32","36","48"],a:1},
    {q:"In quale sport si gareggia per la Stanley Cup?",opts:["Basketball","Football americano","Hockey su ghiaccio","Baseball"],a:2},
    {q:"Chi ha vinto più Mondiali MotoGP?",opts:["Rossi","Agostini","Lorenzo","Marquez"],a:1},
    {q:"Chi ha vinto più Mondiali di nuoto?",opts:["Phelps","Spitz","Biondi","Popov"],a:0},
    {q:"Chi ha vinto più ori olimpici nella lotta?",opts:["Medved","Schultz","Karelin","Blagoev"],a:2},
    {q:"Quanti giocatori ci sono in una squadra di polo?",opts:["2","3","4","5"],a:2},
    {q:"Chi ha vinto più ori olimpici nel canottaggio?",opts:["Pinsent","Redgrave","Lange","Karppinen"],a:1},
    {q:"Chi ha vinto più ori olimpici nella vela?",opts:["Ainslie","Elvström","Scheidt","Thorpe"],a:0},
    {q:"Chi ha vinto più ori olimpici nel ciclismo su strada?",opts:["Armstrong","Indurain","Wiggins","Froome"],a:2},
    {q:"Quante tappe ha il Giro d'Italia?",opts:["18","19","21","23"],a:2},
    {q:"In quale sport si usa il termine peloton?",opts:["Ciclismo","Atletica","Sci","Automobilismo"],a:0},
    {q:"In quale sport si usa il termine axel?",opts:["Pattinaggio artistico","Sci","Ginnastica","Trampolino"],a:0},
    {q:"Chi ha vinto più Mondiali di boxe nel peso massimo?",opts:["Ali","Tyson","Lewis","Klitschko"],a:3},
    {q:"Chi ha vinto più ori olimpici nel pattinaggio artistico?",opts:["Boitano","Klimova","Baiul","Kim"],a:1},
    {q:"Chi ha vinto più Mondiali di Coppe del Mondo di rugby?",opts:["Sudafrica","Australia","Nuova Zelanda","Inghilterra"],a:2},
    {q:"Quante squadre ci sono nella Premier League inglese?",opts:["16","18","20","22"],a:2},
    {q:"Chi ha segnato più gol nei Mondiali di calcio?",opts:["Pelé","Ronaldo B.","Müller","Klose"],a:3},
    {q:"In quale sport si usa il termine home run?",opts:["Cricket","Softball","Baseball","Rounders"],a:2},
    {q:"In quale sport si usa il termine shuttlecock?",opts:["Tennis","Badminton","Squash","Racquetball"],a:1},
    {q:"Chi ha vinto più Mondiali di pallavolo maschile?",opts:["Brasile","Russia","Italia","Cuba"],a:1},
    {q:"Chi ha vinto più Mondiali di pallavolo femminile?",opts:["Russia","Brasile","Cina","Italia"],a:2},
    {q:"Quanti stili ci sono nel nuoto olimpico?",opts:["3","4","5","6"],a:1},
    {q:"Chi ha vinto più Mondiali di sci nordico?",opts:["Björgen","Johaug","Daehlie","Northug"],a:2},
    {q:"Quante medaglie ha vinto Phelps alle Olimpiadi?",opts:["18","21","23","28"],a:2},
    {q:"In quale sport si usa il termine butterfly?",opts:["Solo nuoto","Nuoto e danza","Solo sincronizzato","Molti sport"],a:0},
    {q:"Chi ha vinto più ori olimpici nel ciclismo su pista?",opts:["Cavendish","Wiggins","Hoy","Kenny"],a:3},
    {q:"Chi detiene il record del salto in alto?",opts:["Sotomayor","Fosbury","Sjöberg","Lysenko"],a:0},
    {q:"In quale sport si usa il termine dressage?",opts:["Pattinaggio","Equitazione","Ginnastica","Nuoto sinc."],a:1},
    {q:"Quante tappe ha la Vuelta di Spagna?",opts:["18","19","21","23"],a:2},
    {q:"Chi ha vinto più ori olimpici nel judo?",opts:["Nomura","Parisi","Geesink","Ruska"],a:0},
    {q:"In quale sport si usa il termine par?",opts:["Cricket","Badminton","Golf","Tennis"],a:2},
    {q:"In quale sport si usa il termine bogey?",opts:["Cricket","Golf","Tennis","Badminton"],a:1},
    {q:"Quanti punti vale una trasformazione nel rugby?",opts:["1","2","3","4"],a:1},
    {q:"Quanti punti vale un calcio di punizione nel rugby?",opts:["2","3","4","5"],a:1},
    {q:"Quanti punti vale un drop nel rugby?",opts:["2","3","4","5"],a:1},
    {q:"In quale sport si gareggia per la Thomas Cup?",opts:["Tennis","Badminton","Squash","Ping pong"],a:1},
    {q:"Quante volte si può toccare la palla in un cambio di pallavolo?",opts:["2","3","4","5"],a:1},
    {q:"Chi ha vinto più ori olimpici nel tiro con l'arco?",opts:["Son","Pace","Kim","Park"],a:2},
    {q:"Chi ha vinto più medaglie d'oro olimpiche nella storia?",opts:["Latynina","Phelps","Lewis","Spitz"],a:1},
    {q:"In quale sport si gareggia per la Davis Cup?",opts:["Badminton","Squash","Tennis","Ping pong"],a:2},
    {q:"Chi ha vinto più Mondiali di scacchi?",opts:["Kasparov","Karpov","Fischer","Carlsen"],a:0},
    {q:"Quante piste ci sono in una gara di nuoto olimpica?",opts:["6","7","8","10"],a:2},
    {q:"In quale sport si usa il termine snatch?",opts:["Wrestling","Sollevamento pesi","Judo","Lotta"],a:1},
    {q:"Quante fasi ha il Tour de France?",opts:["15","18","21","25"],a:2},
    {q:"Chi ha vinto più ori olimpici nel nuoto a rana?",opts:["Wilkie","Biondi","Hansen","Koseki"],a:2},
    {q:"In quale sport si usa il termine medley?",opts:["Solo nuoto","Nuoto e atletica","Molti sport","Solo pallanuoto"],a:0},
    {q:"In quale sport si gareggia per la Coppa America?",opts:["Golf","Tennis","Vela","Polo"],a:2},
    {q:"In quale sport si usa il termine sculling?",opts:["Canoa","Canottaggio","Vela","Nuoto"],a:1},
    {q:"Quante tappe ha il Giro d'Italia?",opts:["18","19","21","23"],a:2},
    {q:"Quanti km è la marcia olimpica più lunga?",opts:["10 km","20 km","30 km","50 km"],a:3},
    {q:"In quale sport si usa il termine lob?",opts:["Solo tennis","Tennis e badminton","Solo golf","Molti sport"],a:3},
    {q:"Chi detiene il record mondiale nei 200m?",opts:["Carl Lewis","Usain Bolt","Frank Fredericks","Michael Johnson"],a:1},
    {q:"Quanti giri fa una gara standard di sprint su pista (400m)?",opts:["0.5","1","1.5","2"],a:1},
    {q:"In quale sport si usa il termine tacking?",opts:["Vela","Canoa","Canottaggio","Kayak"],a:0},
    {q:"Quante discipline ha il pentathlon moderno?",opts:["4","5","6","7"],a:1},
    {q:"In quale sport si usa il termine épée?",opts:["Scherma","Equitazione","Tiro","Lotta"],a:0},
    {q:"Chi ha vinto i Mondiali di calcio 2022?",opts:["Francia","Brasile","Argentina","Croazia"],a:2},
    {q:"Chi ha vinto Euro 2020 (giocato nel 2021)?",opts:["Francia","Portogallo","Italia","Inghilterra"],a:2},
    {q:"Quante Coppe del Mondo ha vinto l'Italia?",opts:["2","3","4","5"],a:2},
    {q:"Quante Coppe del Mondo ha vinto la Germania?",opts:["3","4","5","6"],a:1},
    {q:"Quante Coppe del Mondo ha vinto l'Argentina?",opts:["2","3","4","5"],a:1},
  ],
  spettacolo: [
    {q:"Chi ha interpretato Iron Man nel MCU?",opts:["Chris Evans","Robert Downey Jr.","Chris Hemsworth","Mark Ruffalo"],a:1},
    {q:"In quale anno è uscito il primo Star Wars?",opts:["1975","1977","1979","1981"],a:1},
    {q:"Chi ha scritto Harry Potter?",opts:["Stephenie Meyer","Suzanne Collins","J.K. Rowling","C.S. Lewis"],a:2},
    {q:"Qual è il film con il maggior incasso di sempre?",opts:["Avatar","Titanic","Avengers: Endgame","Il Re Leone"],a:0},
    {q:"Quante stagioni ha avuto Game of Thrones?",opts:["6","7","8","9"],a:2},
    {q:"Chi ha diretto Titanic?",opts:["Spielberg","Ridley Scott","James Cameron","Nolan"],a:2},
    {q:"In quale paese è ambientata la serie Narcos?",opts:["Messico","Panama","Colombia","Perù"],a:2},
    {q:"Quale attrice ha interpretato Hermione in Harry Potter?",opts:["Keira Knightley","Emma Watson","Natalie Portman","Emma Stone"],a:1},
    {q:"Chi ha vinto l'Oscar come miglior film nel 2020?",opts:["1917","Joker","Parasite","C'era una volta a Hollywood"],a:2},
    {q:"Chi interpreta Jack Sparrow nei Pirati dei Caraibi?",opts:["Brad Pitt","Orlando Bloom","Johnny Depp","Tom Hanks"],a:2},
    {q:"Chi ha diretto Schindler's List?",opts:["Coppola","Kubrick","Spielberg","Scorsese"],a:2},
    {q:"In quale anno uscì Il Padrino?",opts:["1970","1972","1974","1976"],a:1},
    {q:"Chi ha diretto Il Padrino?",opts:["Spielberg","Coppola","Scorsese","De Palma"],a:1},
    {q:"Quale attore ha interpretato Forrest Gump?",opts:["Tom Cruise","Tom Hanks","Harrison Ford","Kevin Costner"],a:1},
    {q:"In quale anno uscì Jurassic Park?",opts:["1991","1993","1995","1997"],a:1},
    {q:"Chi ha diretto Inception?",opts:["Spielberg","Cameron","Nolan","Fincher"],a:2},
    {q:"Quale attrice ha vinto più Oscar?",opts:["Meryl Streep","Katharine Hepburn","Cate Blanchett","Helen Mirren"],a:1},
    {q:"In quale anno uscì Pulp Fiction?",opts:["1992","1994","1996","1998"],a:1},
    {q:"Chi ha diretto Pulp Fiction?",opts:["Coen Brothers","Lynch","Tarantino","Stone"],a:2},
    {q:"Quale attore ha interpretato James Bond più volte?",opts:["Connery","Moore","Brosnan","Craig"],a:1},
    {q:"In quale anno uscì Il Re Leone?",opts:["1992","1994","1996","1998"],a:1},
    {q:"Quale attore ha interpretato Batman in The Dark Knight?",opts:["Keaton","Kilmer","Clooney","Bale"],a:3},
    {q:"In quale anno uscì Matrix?",opts:["1997","1999","2001","2003"],a:1},
    {q:"Chi ha diretto Matrix?",opts:["Spielberg","Cameron","Wachowski","Fincher"],a:2},
    {q:"Quale attore ha interpretato Tyler Durden in Fight Club?",opts:["Norton","Pitt","Spacey","Damon"],a:1},
    {q:"Chi ha diretto Fight Club?",opts:["Tarantino","Fincher","Nolan","Kubrick"],a:1},
    {q:"Quale attore ha interpretato il Joker in Joker (2019)?",opts:["Nicholson","Ledger","Phoenix","Leto"],a:2},
    {q:"Chi ha diretto Joker (2019)?",opts:["Nolan","Phillips","Snyder","Burton"],a:1},
    {q:"Quale attore ha interpretato Superman in Man of Steel?",opts:["Reeve","Cavill","Routh","Affleck"],a:1},
    {q:"In quale anno uscì Avengers: Endgame?",opts:["2017","2018","2019","2020"],a:2},
    {q:"Chi ha diretto Avengers: Endgame?",opts:["Feige","Whedon","Russo Brothers","Taika"],a:2},
    {q:"Quale attore ha interpretato Tony Montana in Scarface?",opts:["De Niro","Pacino","Nicholson","Brando"],a:1},
    {q:"Chi ha diretto Scarface?",opts:["Coppola","Scorsese","De Palma","Stone"],a:2},
    {q:"Chi ha interpretato Hannibal Lecter in Il Silenzio degli Innocenti?",opts:["De Niro","Hopkins","Nicholson","Pacino"],a:1},
    {q:"Quale attore ha interpretato Rocky Balboa?",opts:["Schwarzenegger","Stallone","Van Damme","Norris"],a:1},
    {q:"Quale attore ha interpretato Terminator?",opts:["Stallone","Willis","Schwarzenegger","Norris"],a:2},
    {q:"Chi ha diretto il primo Terminator?",opts:["Scott","Spielberg","Cameron","Lucas"],a:2},
    {q:"Quale attrice ha interpretato Ripley in Alien?",opts:["Sigourney Weaver","Jamie Lee Curtis","Linda Hamilton","Jodie Foster"],a:0},
    {q:"Chi ha diretto Alien?",opts:["Ridley Scott","Cameron","Lucas","Spielberg"],a:0},
    {q:"Quale attore ha interpretato Indiana Jones?",opts:["Ford","Gibson","Cruise","Eastwood"],a:0},
    {q:"Chi ha diretto il primo Indiana Jones?",opts:["Lucas","Spielberg","Cameron","Scott"],a:1},
    {q:"Chi ha diretto Shining?",opts:["Spielberg","Scorsese","De Palma","Kubrick"],a:3},
    {q:"Quale attore ha interpretato Vito Corleone in Il Padrino?",opts:["Pacino","De Niro","Brando","Nicholson"],a:2},
    {q:"Quale attore ha interpretato Michael Corleone in Il Padrino?",opts:["De Niro","Brando","Pacino","Nicholson"],a:2},
    {q:"Chi ha diretto Il Signore degli Anelli?",opts:["Cameron","Spielberg","Jackson","Scott"],a:2},
    {q:"Quale attore ha interpretato Gandalf nel Signore degli Anelli?",opts:["Patrick Stewart","Ian McKellen","Anthony Hopkins","Derek Jacobi"],a:1},
    {q:"Chi ha interpretato Harry Potter nei film?",opts:["Daniel Radcliffe","Rupert Grint","Tom Felton","Eddie Redmayne"],a:0},
    {q:"Quale attore ha interpretato Dumbledore nella maggior parte dei film HP?",opts:["Richard Harris","Michael Gambon","Ian McKellen","Anthony Hopkins"],a:1},
    {q:"Quale attore ha interpretato Jon Snow in Game of Thrones?",opts:["Richard Madden","Kit Harington","Nikolaj Coster-Waldau","Emilia Clarke"],a:1},
    {q:"Quale attore ha interpretato Walter White in Breaking Bad?",opts:["Aaron Paul","Bob Odenkirk","Bryan Cranston","Dean Norris"],a:2},
    {q:"Chi ha creato Stranger Things?",opts:["Duffer Brothers","JJ Abrams","Ryan Murphy","Shonda Rhimes"],a:0},
    {q:"Quale rete trasmette Stranger Things?",opts:["HBO","Amazon","Netflix","Disney+"],a:2},
    {q:"Da quale paese proviene La Casa di Carta?",opts:["Messico","Argentina","Colombia","Spagna"],a:3},
    {q:"Come si chiama il protagonista di La Casa di Carta?",opts:["Berlino","Tokyo","Il Professore","Denver"],a:2},
    {q:"Chi interpreta Elisabetta II nella prima stagione di The Crown?",opts:["Olivia Colman","Helena Bonham Carter","Claire Foy","Imelda Staunton"],a:2},
    {q:"Chi ha vinto l'Oscar come miglior film nel 2022?",opts:["Power of the Dog","CODA","Dune","Belfast"],a:1},
    {q:"Chi ha diretto Dune (2021)?",opts:["Nolan","Scott","Villeneuve","Snyder"],a:2},
    {q:"Quale attore interpreta Paul Atreides in Dune (2021)?",opts:["Zendaya","Oscar Isaac","Timothée Chalamet","Josh Brolin"],a:2},
    {q:"Chi ha vinto l'Oscar come miglior film nel 2023?",opts:["Avatar 2","Tár","Everything Everywhere All at Once","The Fabelmans"],a:2},
    {q:"Chi ha vinto l'Oscar come miglior attrice nel 2023?",opts:["Cate Blanchett","Michelle Yeoh","Ana de Armas","Andrea Riseborough"],a:1},
    {q:"Chi ha diretto Oppenheimer?",opts:["Spielberg","Scott","Nolan","Villeneuve"],a:2},
    {q:"Chi interpreta Oppenheimer nel film?",opts:["Matt Damon","Cillian Murphy","Tom Hardy","Michael Fassbender"],a:1},
    {q:"Chi ha diretto Barbie (2023)?",opts:["Greta Gerwig","Sofia Coppola","Patty Jenkins","Chloe Zhao"],a:0},
    {q:"Chi interpreta Barbie in Barbie (2023)?",opts:["Zendaya","Margot Robbie","Emma Stone","Florence Pugh"],a:1},
    {q:"Quale film ha vinto l'Oscar come miglior film nel 2024?",opts:["Oppenheimer","Poor Things","Anatomia di una caduta","Zone of Interest"],a:0},
    {q:"Chi ha diretto Squid Game?",opts:["Bong Joon-ho","Park Chan-wook","Hwang Dong-hyuk","Kim Ji-woon"],a:2},
    {q:"Su quale piattaforma è disponibile Squid Game?",opts:["HBO","Disney+","Netflix","Amazon Prime"],a:2},
    {q:"Chi ha diretto Parasite?",opts:["Park Chan-wook","Kim Ji-woon","Bong Joon-ho","Lee Chang-dong"],a:2},
    {q:"Da quale paese proviene il film Parasite?",opts:["Giappone","Cina","Corea del Sud","Taiwan"],a:2},
    {q:"Chi ha interpretato Black Widow nel MCU?",opts:["Gal Gadot","Brie Larson","Scarlett Johansson","Evangeline Lilly"],a:2},
    {q:"Chi ha interpretato Thor nel MCU?",opts:["Chris Evans","Chris Pratt","Chris Hemsworth","Chris Pine"],a:2},
    {q:"Chi ha interpretato Captain America nel MCU?",opts:["Chris Evans","Chris Pratt","Chris Hemsworth","Chris Pine"],a:0},
    {q:"Chi ha interpretato Spider-Man nel MCU?",opts:["Andrew Garfield","Tobey Maguire","Tom Holland","Dylan O'Brien"],a:2},
    {q:"Chi ha interpretato Black Panther nel MCU?",opts:["Idris Elba","Michael B. Jordan","Chadwick Boseman","Winston Duke"],a:2},
    {q:"Chi ha interpretato Doctor Strange nel MCU?",opts:["Tom Hiddleston","Benedict Cumberbatch","Chiwetel Ejiofor","Tilda Swinton"],a:1},
    {q:"Chi ha interpretato Loki nel MCU?",opts:["Tom Hiddleston","Chris Hemsworth","Benedict Cumberbatch","Mark Ruffalo"],a:0},
    {q:"Chi ha interpretato Thanos nel MCU?",opts:["Ron Perlman","Terry Crews","Josh Brolin","Vin Diesel"],a:2},
    {q:"Chi ha interpretato Wolverine nei film X-Men?",opts:["Hugh Jackman","Liam Neeson","Christian Bale","Russell Crowe"],a:0},
    {q:"Chi ha interpretato Professor X nei film X-Men?",opts:["Ian McKellen","Patrick Stewart","Anthony Hopkins","Derek Jacobi"],a:1},
    {q:"Chi ha interpretato Magneto nei film X-Men?",opts:["Patrick Stewart","Derek Jacobi","Anthony Hopkins","Ian McKellen"],a:3},
    {q:"Chi ha diretto Avatar?",opts:["Spielberg","Lucas","Cameron","Scott"],a:2},
    {q:"Chi ha interpretato Jack in Titanic?",opts:["Brad Pitt","Tom Hanks","Leonardo DiCaprio","Matt Damon"],a:2},
    {q:"Chi ha interpretato Rose in Titanic?",opts:["Julia Roberts","Cate Blanchett","Gwyneth Paltrow","Kate Winslet"],a:3},
    {q:"Chi ha diretto Interstellar?",opts:["Spielberg","Cameron","Villeneuve","Nolan"],a:3},
    {q:"Chi ha diretto Gravity?",opts:["Cuarón","Cameron","Nolan","Scott"],a:0},
    {q:"Chi ha interpretato Matt Kowalski in Gravity?",opts:["Tom Hanks","George Clooney","Brad Pitt","Matt Damon"],a:1},
    {q:"Chi ha diretto The Revenant?",opts:["Villeneuve","Cuarón","González Iñárritu","Nolan"],a:2},
    {q:"Chi ha interpretato Hugh Glass in The Revenant?",opts:["Tom Hardy","DiCaprio","McConaughey","Cruise"],a:1},
    {q:"Chi ha diretto Birdman?",opts:["Villeneuve","Cuarón","González Iñárritu","Nolan"],a:2},
    {q:"Chi ha interpretato Riggan Thomson in Birdman?",opts:["Michael Keaton","Johnny Depp","Nicolas Cage","Sean Penn"],a:0},
    {q:"Chi ha diretto The Hurt Locker?",opts:["Bigelow","Cameron","Spielberg","Stone"],a:0},
    {q:"Chi ha diretto The Social Network?",opts:["Fincher","Nolan","Spielberg","Scott"],a:0},
    {q:"Chi interpreta Mark Zuckerberg in The Social Network?",opts:["Eisenberg","Timberlake","Garfield","Hammer"],a:0},
    {q:"Chi ha vinto l'Oscar come miglior film nel 2013?",opts:["Lincoln","Silver Linings Playbook","Argo","Django Unchained"],a:2},
    {q:"Chi ha diretto Argo?",opts:["Affleck","Clooney","Pitt","Damon"],a:0},
    {q:"Chi ha vinto l'Oscar come miglior film nel 2017?",opts:["La La Land","Moonlight","Manchester by the Sea","Arrival"],a:1},
    {q:"Chi ha vinto l'Oscar come miglior film nel 2019?",opts:["Roma","BlackkKlansman","Green Book","The Favourite"],a:2},
    {q:"Chi ha vinto l'Oscar come miglior attore nel 2020?",opts:["Joaquin Phoenix","Antonio Banderas","Adam Driver","Leonardo DiCaprio"],a:0},
    {q:"Chi ha vinto l'Oscar come miglior film nel 2021?",opts:["Mank","Nomadland","The Father","Promising Young Woman"],a:1},
    {q:"Chi ha vinto l'Oscar come miglior attore nel 2021?",opts:["Chadwick Boseman","Anthony Hopkins","Riz Ahmed","Gary Oldman"],a:1},
    {q:"Chi ha creato Breaking Bad?",opts:["Vince Gilligan","David Chase","Matthew Weiner","Alan Ball"],a:0},
    {q:"Chi ha interpretato la Sirenetta nel film live-action 2023?",opts:["Zendaya","Halle Bailey","Nathalie Emmanuel","Storm Reid"],a:1},
    {q:"Chi ha interpretato il Genio in Aladdin live-action 2019?",opts:["Eddie Murphy","Will Smith","Chris Rock","Kevin Hart"],a:1},
    {q:"Chi ha interpretato Ryan Stone in Gravity?",opts:["Cate Blanchett","Scarlett Johansson","Sandra Bullock","Julia Roberts"],a:2},
    {q:"Chi ha vinto l'Oscar come miglior film nel 2016?",opts:["The Revenant","The Big Short","Mad Max","Spotlight"],a:3},
    {q:"Chi ha vinto l'Oscar come miglior film nel 2015?",opts:["Boyhood","Birdman","The Imitation Game","Whiplash"],a:1},
    {q:"Chi ha vinto l'Oscar come miglior film nel 2010?",opts:["Avatar","Il Discorso del Re","The Hurt Locker","Inglourious Basterds"],a:2},
    {q:"Chi ha vinto l'Oscar come miglior film nel 2018?",opts:["Get Out","The Shape of Water","Dunkirk","Three Billboards"],a:1},
    {q:"Chi ha vinto l'Oscar come miglior attrice nel 2021?",opts:["Viola Davis","Andra Day","Frances McDormand","Carey Mulligan"],a:2},
    {q:"Quale attore ha interpretato Superman nel film del 1978?",opts:["Christopher Reeve","George Reeves","Brandon Routh","Henry Cavill"],a:0},
    {q:"Quale attore ha interpretato Batman nel film del 1989?",opts:["Adam West","Val Kilmer","Michael Keaton","George Clooney"],a:2},
    {q:"In quale anno uscì Avatar?",opts:["2007","2009","2011","2013"],a:1},
    {q:"In quale anno uscì Avatar: La Via dell'Acqua?",opts:["2020","2021","2022","2023"],a:2},
    {q:"In quale anno uscì Titanic?",opts:["1995","1997","1999","2001"],a:1},
    {q:"Chi ha vinto l'Oscar come miglior film nel 2014?",opts:["Gravity","Her","American Hustle","12 Years a Slave"],a:3},
    {q:"Chi ha vinto l'Oscar come miglior film nel 2012?",opts:["The Artist","Hugo","Midnight in Paris","The Descendants"],a:0},
    {q:"Chi ha vinto l'Oscar come miglior attrice nel 2020?",opts:["Scarlett Johansson","Charlize Theron","Renée Zellweger","Saoirse Ronan"],a:2},
  ],
  scienza: [
    {q:"Qual è il pianeta più grande del sistema solare?",opts:["Saturno","Nettuno","Giove","Urano"],a:2},
    {q:"A quanti gradi Celsius bolle l'acqua?",opts:["90","95","100","105"],a:2},
    {q:"Qual è l'animale terrestre più veloce?",opts:["Leone","Ghepardo","Visone","Antilope"],a:1},
    {q:"Quante zampe ha un ragno?",opts:["6","8","10","12"],a:1},
    {q:"Qual è l'organo più grande del corpo umano?",opts:["Fegato","Polmone","Pelle","Intestino"],a:2},
    {q:"Che cosa studia la sismologia?",opts:["Oceani","Terremoti","Vulcani","Clima"],a:1},
    {q:"Qual è il gas più abbondante nell'atmosfera terrestre?",opts:["Ossigeno","Anidride carbonica","Azoto","Argon"],a:2},
    {q:"Quanti minuti impiega la luce del Sole a raggiungere la Terra?",opts:["2","8","20","60"],a:1},
    {q:"Qual è il mammifero più grande del mondo?",opts:["Elefante africano","Balena blu","Squalo balena","Giraffa"],a:1},
    {q:"Quanti cuori ha un polipo?",opts:["1","2","3","4"],a:2},
    {q:"Da quante coppie di cromosomi è composto il genoma umano?",opts:["21","23","25","46"],a:1},
    {q:"Qual è l'elemento più abbondante nell'universo?",opts:["Ossigeno","Carbonio","Idrogeno","Elio"],a:2},
    {q:"Chi ha formulato la teoria della relatività?",opts:["Newton","Einstein","Bohr","Heisenberg"],a:1},
    {q:"Qual è la velocità del suono nell'aria?",opts:["340 m/s","740 m/s","1100 m/s","3400 m/s"],a:0},
    {q:"Chi ha scoperto la legge di gravità?",opts:["Einstein","Galileo","Newton","Copernicus"],a:2},
    {q:"Quanti elementi ci sono nella tavola periodica?",opts:["100","108","118","126"],a:2},
    {q:"Chi ha proposto il modello eliocentrico?",opts:["Tolomeo","Copernico","Galileo","Keplero"],a:1},
    {q:"Qual è la struttura del DNA?",opts:["Elica singola","Doppia elica","Tripla elica","Circolare"],a:1},
    {q:"Chi ha scoperto la struttura del DNA?",opts:["Watson e Crick","Franklin","Wilkins","Tutti"],a:3},
    {q:"Qual è il periodo di rivoluzione della Terra intorno al Sole?",opts:["265 giorni","365 giorni","366 giorni","400 giorni"],a:1},
    {q:"Chi ha scoperto la penicillina?",opts:["Pasteur","Fleming","Curie","Koch"],a:1},
    {q:"Chi ha scoperto i raggi X?",opts:["Curie","Röntgen","Becquerel","Thomson"],a:1},
    {q:"Qual è la distanza media Terra-Sole?",opts:["100 milioni km","150 milioni km","200 milioni km","250 milioni km"],a:1},
    {q:"Chi ha scoperto la radioattività?",opts:["Curie","Becquerel","Röntgen","Rutherford"],a:1},
    {q:"Qual è il periodo di rivoluzione della Luna?",opts:["14 giorni","28 giorni","29,5 giorni","31 giorni"],a:2},
    {q:"Chi ha scoperto gli elettroni?",opts:["Rutherford","Bohr","Thomson","Millikan"],a:2},
    {q:"Chi ha scoperto il nucleo atomico?",opts:["Thomson","Bohr","Rutherford","Chadwick"],a:2},
    {q:"Chi ha scoperto i neutroni?",opts:["Thomson","Rutherford","Chadwick","Bohr"],a:2},
    {q:"Chi ha proposto la teoria quantistica?",opts:["Einstein","Bohr","Planck","Heisenberg"],a:2},
    {q:"Chi ha proposto il principio di indeterminazione?",opts:["Einstein","Bohr","Heisenberg","Schrödinger"],a:2},
    {q:"Chi ha proposto il modello atomico a livelli?",opts:["Rutherford","Thomson","Bohr","Planck"],a:2},
    {q:"Chi ha scoperto l'effetto fotoelettrico?",opts:["Newton","Bohr","Einstein","Planck"],a:2},
    {q:"Chi ha formulato le leggi dei moti planetari?",opts:["Copernico","Galileo","Keplero","Newton"],a:2},
    {q:"Chi ha proposto la teoria della deriva dei continenti?",opts:["Darwin","Wegener","Hutton","Lyell"],a:1},
    {q:"Chi ha proposto il Big Bang?",opts:["Einstein","Lemaitre","Hubble","Gamow"],a:1},
    {q:"Chi ha scoperto l'espansione dell'universo?",opts:["Einstein","Lemaitre","Hubble","Slipher"],a:2},
    {q:"Chi ha scoperto il vaccino contro il vaiolo?",opts:["Pasteur","Koch","Jenner","Lister"],a:2},
    {q:"Chi ha scoperto l'insulina?",opts:["Fleming","Banting","Best","Banting e Best"],a:3},
    {q:"Chi ha scoperto il virus HIV?",opts:["Montagnier e Barré-Sinoussi","Pasteur","Koch","Jenner"],a:0},
    {q:"Chi ha scoperto la legge di Ohm?",opts:["Volt","Ampere","Ohm","Faraday"],a:2},
    {q:"Chi ha scoperto l'elettromagnetismo?",opts:["Volta","Faraday","Ampere","Ohm"],a:1},
    {q:"Chi ha sviluppato il primo transistor?",opts:["Shockley e colleghi","Von Neumann","Turing","Shannon"],a:0},
    {q:"Chi ha scoperto la superconduttività?",opts:["Onnes","Dewar","Faraday","Curie"],a:0},
    {q:"Chi ha scoperto il laser?",opts:["Maiman","Townes","Prokhorov","Tutti"],a:0},
    {q:"Chi ha proposto il principio di esclusione?",opts:["Fermi","Bose","Pauli","Dirac"],a:2},
    {q:"Chi ha formulato le leggi del moto?",opts:["Galileo","Newton","Einstein","Faraday"],a:1},
    {q:"Chi ha formulato l'equazione di Bernoulli?",opts:["Euler","Bernoulli","Navier","Stokes"],a:1},
    {q:"Chi ha formulato le leggi della termodinamica?",opts:["Carnot","Clausius","Kelvin","Tutti"],a:3},
    {q:"Chi ha scoperto l'effetto Doppler?",opts:["Doppler","Mach","Hertz","Rayleigh"],a:0},
    {q:"Chi ha scoperto la cellula?",opts:["Van Leeuwenhoek","Hooke","Brown","Schwann"],a:1},
    {q:"Chi ha inventato il microscopio?",opts:["Galileo","Van Leeuwenhoek","Hooke","Janssen"],a:3},
    {q:"Chi ha fondato l'epidemiologia moderna?",opts:["Pasteur","Koch","Snow","Lister"],a:2},
    {q:"Chi ha sviluppato la chemioterapia?",opts:["Fleming","Ehrlich","Domagk","Chain"],a:1},
    {q:"Chi ha scoperto la circolazione sanguigna?",opts:["Vesalio","Harvey","Malpighi","Serveto"],a:1},
    {q:"Chi ha fondato l'anatomia moderna?",opts:["Galeno","Ippocrate","Vesalio","Harvey"],a:2},
    {q:"Chi ha scoperto i neuroni?",opts:["Cajal","Golgi","Purkinje","Sherrington"],a:0},
    {q:"Chi ha fondato la psicoanalisi?",opts:["Jung","Adler","Freud","Skinner"],a:2},
    {q:"Chi ha inventato il calcolo differenziale?",opts:["Newton","Leibniz","Newton e Leibniz","Eulero"],a:2},
    {q:"Chi ha formulato i teoremi di incompletezza?",opts:["Gödel","Russell","Hilbert","Peano"],a:0},
    {q:"Chi ha dimostrato l'ultimo teorema di Fermat?",opts:["Wiles","Faltings","Taylor","Iwasawa"],a:0},
    {q:"Chi ha fondato l'informatica teorica?",opts:["Von Neumann","Turing","Shannon","Church"],a:1},
    {q:"Qual è la temperatura sulla superficie del Sole?",opts:["3000°","6000°","12000°","50000°"],a:1},
    {q:"Qual è il diametro della Terra in km?",opts:["6371 km","10000 km","12742 km","20000 km"],a:2},
    {q:"Qual è la distanza dal Sole alla stella più vicina?",opts:["2 anni luce","4,2 anni luce","10 anni luce","100 anni luce"],a:1},
    {q:"Qual è il pH del sangue umano?",opts:["6.8-7.0","7.35-7.45","7.5-7.6","7.8-8.0"],a:1},
    {q:"Qual è la pressione sanguigna normale?",opts:["80/60 mmHg","120/80 mmHg","140/90 mmHg","160/100 mmHg"],a:1},
    {q:"Quanti neuroni ha il cervello umano?",opts:["1 miliardo","86 miliardi","200 miliardi","500 miliardi"],a:1},
    {q:"Qual è il numero di cellule nel corpo umano?",opts:["37 miliardi","37 trilioni","37 milioni","370 miliardi"],a:1},
    {q:"Qual è la lunghezza d'onda della luce visibile?",opts:["100-200 nm","380-700 nm","800-1000 nm","1000-2000 nm"],a:1},
    {q:"Qual è la composizione dell'aria secca?",opts:["80% O2","78% N2","50% N2","90% N2"],a:1},
    {q:"Qual è il numero di Avogadro?",opts:["6.02×10²³","6.02×10²¹","6.02×10²⁵","6.02×10¹⁹"],a:0},
    {q:"Cosa studia la botanica?",opts:["Animali","Funghi","Piante","Batteri"],a:2},
    {q:"Cosa studia la zoologia?",opts:["Piante","Animali","Funghi","Batteri"],a:1},
    {q:"Cosa studia la vulcanologia?",opts:["Terremoti","Vulcani","Oceani","Atmosfera"],a:1},
    {q:"Cosa studia la meteorologia?",opts:["Mare","Atmosfera e clima","Montagne","Deserti"],a:1},
    {q:"Cosa studia la paleontologia?",opts:["Fossili","Piante","Animali moderni","Minerali"],a:0},
    {q:"Cosa studia la genetica?",opts:["Cellule","Geni e eredità","Proteine","RNA"],a:1},
    {q:"Cosa studia la neurologia?",opts:["Cuore","Sistema nervoso","Polmoni","Ossa"],a:1},
    {q:"Cosa studia la cardiologia?",opts:["Cuore","Polmoni","Reni","Cervello"],a:0},
    {q:"Cosa studia l'immunologia?",opts:["Ossa","Sistema immunitario","Muscoli","Pelle"],a:1},
    {q:"Cosa studia l'endocrinologia?",opts:["Ossa","Ghiandole e ormoni","Muscoli","Nervi"],a:1},
    {q:"Cosa studia la farmacologia?",opts:["Piante","Farmaci","Virus","Batteri"],a:1},
    {q:"Cosa studia la virologia?",opts:["Batteri","Virus","Funghi","Prioni"],a:1},
    {q:"Cosa studia la biologia marina?",opts:["Solo pesci","Ecosistemi marini","Solo balene","Solo plancton"],a:1},
    {q:"Cosa studia la climatologia?",opts:["Meteo giornaliero","Clima a lungo termine","Nuvole","Vento"],a:1},
    {q:"Cosa studia la cosmologia?",opts:["Stelle","Universo nel suo complesso","Galassie","Pianeti"],a:1},
    {q:"Cosa studia la fisica delle particelle?",opts:["Atomi","Particelle subatomiche","Molecole","Solidi"],a:1},
    {q:"Cosa studia la nanotecnologia?",opts:["Macro strutture","Nano strutture","Micro strutture","Macro molecole"],a:1},
    {q:"Cosa studia la termodinamica?",opts:["Solo calore","Calore e lavoro","Solo temperatura","Solo entropia"],a:1},
    {q:"Cosa studia l'acustica?",opts:["Luce","Suono","Calore","Elettricità"],a:1},
    {q:"Cosa studia la fluidodinamica?",opts:["Solidi","Fluidi in moto","Gas statici","Superfici"],a:1},
    {q:"Cosa studia la biologia cellulare?",opts:["Organismi interi","Cellule","Tessuti","Organi"],a:1},
    {q:"Cosa studia la fisiologia?",opts:["Struttura del corpo","Funzioni del corpo","Malattie","Farmaci"],a:1},
    {q:"Cosa studia l'anatomia?",opts:["Funzioni","Struttura","Malattie","Farmaci"],a:1},
    {q:"Cosa studia l'entomologia?",opts:["Piante","Insetti","Rettili","Uccelli"],a:1},
    {q:"Cosa studia l'ornitologia?",opts:["Piante","Insetti","Uccelli","Pesci"],a:2},
    {q:"Cosa studia l'ittiologia?",opts:["Pesci","Insetti","Rettili","Anfibi"],a:0},
    {q:"Cosa studia la linguistica?",opts:["Letteratura","Lingua e linguaggio","Storia","Filosofia"],a:1},
    {q:"Cosa studia la psicologia?",opts:["Solo mente","Mente e comportamento","Solo comportamento","Neurologia"],a:1},
    {q:"Qual è il teorema di Pitagora?",opts:["a²+b²=c²","a+b=c","a²-b²=c","a²+b=c²"],a:0},
    {q:"Qual è la terza legge di Newton?",opts:["F=ma","Inerzia","Azione-reazione","Gravitazione"],a:2},
    {q:"Qual è il principio di Archimede?",opts:["Gravitazione","Spinta di galleggiamento","Pressione","Viscosità"],a:1},
    {q:"Qual è il secondo principio della termodinamica?",opts:["Conservazione energia","Entropia aumenta","Zero assoluto","Calore specifico"],a:1},
    {q:"Qual è il numero immaginario i?",opts:["√(-1)","√1","√2","√(-2)"],a:0},
    {q:"Quanti anni ha l'universo (approssimativamente)?",opts:["7 miliardi","10 miliardi","14 miliardi","20 miliardi"],a:2},
    {q:"Quanti anni ha la Terra (approssimativamente)?",opts:["2,5 miliardi","4,5 miliardi","6,5 miliardi","8,5 miliardi"],a:1},
    {q:"Qual è la teoria dell'evoluzione di Darwin?",opts:["Selezione naturale","Lamarckismo","Panspermia","Creazionismo"],a:0},
    {q:"Qual è il periodo di rivoluzione di Marte?",opts:["1 anno","1,5 anni","2 anni","2,5 anni"],a:2},
    {q:"Qual è il periodo di rivoluzione di Giove?",opts:["6 anni","12 anni","18 anni","24 anni"],a:1},
    {q:"Qual è il raggio del Sole?",opts:["500.000 km","700.000 km","1.000.000 km","1.500.000 km"],a:1},
    {q:"Qual è la percentuale di materia oscura nell'universo?",opts:["5%","27%","68%","95%"],a:1},
    {q:"Qual è la percentuale di energia oscura nell'universo?",opts:["5%","27%","68%","95%"],a:2},
    {q:"Chi ha sviluppato la grammatica generativa?",opts:["Saussure","Chomsky","Bloomfield","Sapir"],a:1},
    {q:"Chi ha fondato la statistica moderna?",opts:["Galton","Pearson","Fisher","Tutti"],a:3},
    {q:"Qual è il teorema centrale del limite?",opts:["La somma di variabili tende alla normale","Legge dei grandi numeri","Teorema di Bayes","Chebyshev"],a:0},
    {q:"Quanti tipi di sangue esistono nel sistema ABO?",opts:["3","4","5","6"],a:1},
    {q:"Qual è il principale ormone dello stress?",opts:["Insulina","Cortisolo","Adrenalina","Serotonina"],a:1},
    {q:"Quante lingue ci sono nel mondo?",opts:["3000","5000","7000","10000"],a:2},
    {q:"Qual è la frequenza della corrente elettrica in Italia?",opts:["50 Hz","60 Hz","100 Hz","120 Hz"],a:0},
    {q:"Qual è la tensione elettrica standard in Italia?",opts:["110 V","120 V","220 V","230 V"],a:3},
    {q:"Chi ha proposto la tettonica a zolle?",opts:["Wegener","Wilson e Morgan","Holmes","Hess"],a:1},
    {q:"Chi ha scoperto l'adrenalina?",opts:["Starling","Bayliss","Takamine","Abel"],a:2},
    {q:"Qual è il punto di ebollizione dell'azoto liquido?",opts:["-196°C","-100°C","-50°C","-273°C"],a:0},
    {q:"Quanti litri di aria inspira un adulto al giorno?",opts:["5000","10000","15000","20000"],a:2},
    {q:"Chi ha scoperto la struttura del benzene?",opts:["Kekulé","Liebig","Wöhler","Bunsen"],a:0},
    {q:"Chi ha scoperto la legge di Coulomb?",opts:["Volt","Coulomb","Faraday","Ampere"],a:1},
  ],
  musica: [
    {q:"Chi canta questa canzone?",yt:"dQw4w9WgXcQ",opts:["Michael Jackson","Rick Astley","George Michael","Prince"],a:1},
    {q:"Come si chiama questa canzone?",yt:"lp-EO5I60KA",opts:["Billie Jean","Thriller","Beat It","Black or White"],a:0},
    {q:"Chi canta questa canzone?",yt:"SlPhMPnQ58k",opts:["Adele","Amy Winehouse","Duffy","Paloma Faith"],a:1},
    {q:"Come si chiama questa canzone?",yt:"pRpeEdMmmQ0",opts:["Shake It Off","Love Story","Blank Space","Bad Blood"],a:2},
    {q:"Chi canta questa canzone?",yt:"bo_efYLyqU4",opts:["Lady Gaga","Katy Perry","Rihanna","Beyoncé"],a:2},
    {q:"Come si chiama questa canzone?",yt:"fRh_vgS2dFE",opts:["Sorry","Love Yourself","Baby","Stay"],a:0},
    {q:"Chi canta questa canzone?",yt:"YQHsXMglC9A",opts:["Mariah Carey","Celine Dion","Whitney Houston","Aretha Franklin"],a:2},
    {q:"Come si chiama questa canzone?",yt:"kXYiU_JCYtU",opts:["Numb","In The End","Crawling","Somewhere I Belong"],a:1},
    {q:"Chi canta questa canzone?",yt:"hLQl3WQQoQ0",opts:["Adele","Sam Smith","Ed Sheeran","James Arthur"],a:0},
    {q:"Come si chiama questa canzone?",yt:"OPf0YbXqDm0",opts:["Uptown Funk","Happy","Can't Stop the Feeling","24K Magic"],a:0},
    {q:"Chi canta questa canzone?",yt:"CevxZvSJLk8",opts:["Katy Perry","Miley Cyrus","Selena Gomez","Demi Lovato"],a:0},
    {q:"Come si chiama questa canzone?",yt:"09R8_2nJtjg",opts:["Telephone","Poker Face","Bad Romance","Just Dance"],a:2},
    {q:"Chi ha composto le Quattro Stagioni?",opts:["Bach","Handel","Vivaldi","Corelli"],a:2},
    {q:"Qual è il nome della band di Freddie Mercury?",opts:["Led Zeppelin","Queen","The Rolling Stones","Pink Floyd"],a:1},
    {q:"In quale paese è nato Mozart?",opts:["Germania","Svizzera","Austria","Italia"],a:2},
    {q:"Quante corde ha una chitarra classica?",opts:["4","5","6","7"],a:2},
    {q:"Chi è il Re del Pop?",opts:["Elvis Presley","Prince","Michael Jackson","David Bowie"],a:2},
    {q:"Quale strumento suonava Louis Armstrong?",opts:["Sassofono","Tromba","Clarinetto","Trombone"],a:1},
    {q:"Chi ha cantato Like a Prayer?",opts:["Whitney Houston","Madonna","Mariah Carey","Celine Dion"],a:1},
    {q:"In quale decennio è nata la musica disco?",opts:["Anni '60","Anni '70","Anni '80","Anni '90"],a:1},
    {q:"Quante note ci sono nella scala musicale?",opts:["5","6","7","8"],a:2},
    {q:"Chi ha scritto Bohemian Rhapsody?",opts:["John Lennon","David Bowie","Freddie Mercury","Elton John"],a:2},
    {q:"Quale band ha inciso Hotel California?",opts:["The Doors","Eagles","Fleetwood Mac","Crosby Stills Nash"],a:1},
    {q:"Come si chiama la voce più grave nel canto classico maschile?",opts:["Tenore","Baritono","Basso","Controtenore"],a:2},
    {q:"Quale band ha inciso Stairway to Heaven?",opts:["Deep Purple","Black Sabbath","Led Zeppelin","Jimi Hendrix"],a:2},
    {q:"Chi ha cantato Purple Rain?",opts:["Michael Jackson","Prince","James Brown","Stevie Wonder"],a:1},
    {q:"Quale band ha inciso Smells Like Teen Spirit?",opts:["Pearl Jam","Soundgarden","Nirvana","Alice in Chains"],a:2},
    {q:"Chi ha cantato Billie Jean?",opts:["Prince","James Brown","Michael Jackson","Stevie Wonder"],a:2},
    {q:"Chi ha cantato Rolling in the Deep?",opts:["Beyoncé","Rihanna","Adele","Amy Winehouse"],a:2},
    {q:"Quale band ha inciso Sweet Child O Mine?",opts:["Aerosmith","Def Leppard","Guns N' Roses","Bon Jovi"],a:2},
    {q:"Quale band ha inciso Don't Stop Believin'?",opts:["Boston","Foreigner","Journey","Kansas"],a:2},
    {q:"Chi ha cantato Hello (2015)?",opts:["Beyoncé","Rihanna","Adele","Amy Winehouse"],a:2},
    {q:"Quale band ha inciso November Rain?",opts:["Aerosmith","Metallica","Guns N' Roses","Bon Jovi"],a:2},
    {q:"Chi ha cantato Shape of You?",opts:["Sam Smith","Harry Styles","Ed Sheeran","James Bay"],a:2},
    {q:"Quale band ha inciso Enter Sandman?",opts:["Megadeth","Slayer","Metallica","Pantera"],a:2},
    {q:"Chi ha cantato Stay With Me?",opts:["Ed Sheeran","James Bay","Sam Smith","James Blunt"],a:2},
    {q:"Quale band ha inciso Comfortably Numb?",opts:["The Who","Yes","Pink Floyd","Genesis"],a:2},
    {q:"Chi ha cantato Someone Like You?",opts:["Beyoncé","Rihanna","Adele","Amy Winehouse"],a:2},
    {q:"Quale band ha inciso Paranoid?",opts:["Iron Maiden","Judas Priest","Black Sabbath","Dio"],a:2},
    {q:"Chi ha cantato Baby One More Time?",opts:["Christina Aguilera","Britney Spears","Jessica Simpson","Mandy Moore"],a:1},
    {q:"Chi ha cantato Hips Don't Lie?",opts:["Jennifer Lopez","Shakira","Rihanna","Beyoncé"],a:1},
    {q:"Chi ha cantato Poker Face?",opts:["Kesha","Katy Perry","Lady Gaga","Rihanna"],a:2},
    {q:"Quale band ha inciso Mr. Brightside?",opts:["The Strokes","Interpol","The Killers","Franz Ferdinand"],a:2},
    {q:"Chi ha cantato Umbrella?",opts:["Beyoncé","Rihanna","Ciara","Ashanti"],a:1},
    {q:"Quale band ha inciso Seven Nation Army?",opts:["The Strokes","The White Stripes","The Vines","The Hives"],a:1},
    {q:"Chi ha cantato Crazy in Love?",opts:["Alicia Keys","Mary J. Blige","Beyoncé","Ciara"],a:2},
    {q:"Chi ha cantato In Da Club?",opts:["Jay-Z","Kanye West","50 Cent","Lil Wayne"],a:2},
    {q:"Chi ha cantato Diamonds?",opts:["Beyoncé","Rihanna","Katy Perry","Selena Gomez"],a:1},
    {q:"Chi ha cantato Royals?",opts:["Lana Del Rey","Sky Ferreira","Lorde","Grimes"],a:2},
    {q:"Quale band ha inciso Happy?",opts:["Pharrell Williams","Bruno Mars","Mark Ronson","Robin Thicke"],a:0},
    {q:"Chi ha cantato Chandelier?",opts:["Sia","Ellie Goulding","Lana Del Rey","Lorde"],a:0},
    {q:"Quale band ha inciso Uptown Funk?",opts:["Bruno Mars","Pharrell Williams","Mark Ronson","Justin Timberlake"],a:2},
    {q:"Chi ha cantato Bad Blood?",opts:["Katy Perry","Selena Gomez","Taylor Swift","Ariana Grande"],a:2},
    {q:"Chi ha cantato Sorry?",opts:["One Direction","Justin Timberlake","Justin Bieber","Shawn Mendes"],a:2},
    {q:"Chi ha cantato Work?",opts:["Beyoncé","Rihanna","Nicki Minaj","Cardi B"],a:1},
    {q:"Chi ha cantato Cheap Thrills?",opts:["Sia","Ellie Goulding","Lorde","Charli XCX"],a:0},
    {q:"Quale band ha inciso Closer?",opts:["Twenty One Pilots","Chainsmokers","Imagine Dragons","Bastille"],a:1},
    {q:"Chi ha cantato Bad Guy?",opts:["Lorde","Lana Del Rey","Halsey","Billie Eilish"],a:3},
    {q:"Quale band ha inciso Old Town Road?",opts:["Lil Nas X","Tyler the Creator","Jack Harlow","Doja Cat"],a:0},
    {q:"Chi ha cantato Blinding Lights?",opts:["Drake","The Weeknd","Future","Travis Scott"],a:1},
    {q:"Quale band ha inciso Levitating?",opts:["Dua Lipa","Doja Cat","Cardi B","Megan Thee Stallion"],a:0},
    {q:"Chi ha cantato Good 4 U?",opts:["Olivia Rodrigo","Billie Eilish","Gracie Abrams","Phoebe Bridgers"],a:0},
    {q:"Chi ha cantato As It Was?",opts:["Harry Styles","Niall Horan","Louis Tomlinson","Liam Payne"],a:0},
    {q:"Quale band ha inciso Heat Waves?",opts:["Coldplay","Imagine Dragons","Glass Animals","Bastille"],a:2},
    {q:"Chi ha cantato Anti-Hero?",opts:["Olivia Rodrigo","Billie Eilish","Taylor Swift","Ariana Grande"],a:2},
    {q:"Quale band ha inciso Flowers?",opts:["Dua Lipa","Doja Cat","Miley Cyrus","Selena Gomez"],a:2},
    {q:"Chi ha cantato Cruel Summer?",opts:["Katy Perry","Selena Gomez","Taylor Swift","Ariana Grande"],a:2},
    {q:"Chi ha cantato Despacito?",opts:["J Balvin","Maluma","Luis Fonsi","Ozuna"],a:2},
    {q:"Chi ha cantato Gasolina?",opts:["J Balvin","Maluma","Daddy Yankee","Ozuna"],a:2},
    {q:"Chi ha cantato Titanium?",opts:["Avicii","David Guetta e Sia","Calvin Harris","Skrillex"],a:1},
    {q:"Chi ha cantato Wake Me Up?",opts:["Martin Garrix","David Guetta","Avicii","Tiesto"],a:2},
    {q:"Chi ha cantato Levels?",opts:["Avicii","Calvin Harris","Skrillex","Deadmau5"],a:0},
    {q:"Chi ha cantato Riptide?",opts:["Vance Joy","Ed Sheeran","John Mayer","Jack Johnson"],a:0},
    {q:"Chi ha cantato Take Me to Church?",opts:["Passenger","Hozier","James Bay","Ben Howard"],a:1},
    {q:"Chi ha cantato Let Her Go?",opts:["Vance Joy","Passenger","Ed Sheeran","James Bay"],a:1},
    {q:"Chi ha cantato Counting Stars?",opts:["Imagine Dragons","Bastille","OneRepublic","Maroon 5"],a:2},
    {q:"Chi ha cantato Radioactive?",opts:["Bastille","OneRepublic","Imagine Dragons","Coldplay"],a:2},
    {q:"Chi ha cantato Pompeii?",opts:["Imagine Dragons","Bastille","Elbow","Editors"],a:1},
    {q:"Chi ha cantato Viva la Vida?",opts:["Radiohead","Muse","Coldplay","U2"],a:2},
    {q:"Chi ha cantato Fix You?",opts:["Radiohead","Muse","Coldplay","U2"],a:2},
    {q:"Chi ha cantato Creep?",opts:["Radiohead","Muse","Coldplay","U2"],a:0},
    {q:"Chi ha cantato Uprising?",opts:["Radiohead","Muse","Coldplay","U2"],a:1},
    {q:"Chi ha cantato With or Without You?",opts:["Radiohead","Muse","Coldplay","U2"],a:3},
    {q:"Chi ha cantato Wonderwall?",opts:["Blur","Pulp","Oasis","Suede"],a:2},
    {q:"Chi ha cantato Common People?",opts:["Blur","Pulp","Oasis","Suede"],a:1},
    {q:"Chi ha cantato Chasing Cars?",opts:["Keane","Snow Patrol","Travis","Athlete"],a:1},
    {q:"Chi ha cantato Somewhere Only We Know?",opts:["Keane","Snow Patrol","Travis","Athlete"],a:0},
    {q:"Chi ha cantato Black Hole Sun?",opts:["Pearl Jam","Soundgarden","Alice in Chains","Stone Temple Pilots"],a:1},
    {q:"Chi ha cantato Jeremy?",opts:["Pearl Jam","Soundgarden","Alice in Chains","Stone Temple Pilots"],a:0},
    {q:"Chi ha cantato Man in the Box?",opts:["Pearl Jam","Soundgarden","Alice in Chains","Stone Temple Pilots"],a:2},
    {q:"Chi ha cantato Come as You Are?",opts:["Pearl Jam","Soundgarden","Nirvana","Stone Temple Pilots"],a:2},
    {q:"Chi ha cantato Everlong?",opts:["Foo Fighters","Nirvana","Weezer","Pixies"],a:0},
    {q:"Chi ha cantato All the Small Things?",opts:["Green Day","Blink-182","Sum 41","The Offspring"],a:1},
    {q:"Chi ha cantato Basket Case?",opts:["Green Day","Blink-182","Sum 41","The Offspring"],a:0},
    {q:"Chi ha cantato Boulevard of Broken Dreams?",opts:["Green Day","Blink-182","Sum 41","My Chemical Romance"],a:0},
    {q:"Chi ha cantato Welcome to the Black Parade?",opts:["Green Day","Blink-182","Sum 41","My Chemical Romance"],a:3},
    {q:"Chi ha cantato California Love?",opts:["Notorious B.I.G.","Tupac","Jay-Z","Dr. Dre"],a:1},
    {q:"Chi ha cantato Empire State of Mind?",opts:["Jay-Z e Alicia Keys","Nas","Biggie","Kanye West"],a:0},
    {q:"Chi ha cantato HUMBLE?",opts:["J. Cole","Kendrick Lamar","Drake","Travis Scott"],a:1},
    {q:"Chi ha cantato God's Plan?",opts:["J. Cole","Kendrick Lamar","Drake","Travis Scott"],a:2},
    {q:"Chi ha cantato SICKO MODE?",opts:["J. Cole","Kendrick Lamar","Drake","Travis Scott"],a:3},
    {q:"Chi ha cantato MONTERO?",opts:["Lil Nas X","Tyler the Creator","Jack Harlow","Doja Cat"],a:0},
    {q:"Chi ha cantato WAP?",opts:["Nicki Minaj","Cardi B","Megan Thee Stallion","Doja Cat"],a:1},
    {q:"Chi ha cantato Super Bass?",opts:["Cardi B","Nicki Minaj","Doja Cat","Megan Thee Stallion"],a:1},
    {q:"Chi ha cantato IDGAF?",opts:["Dua Lipa","Ariana Grande","Selena Gomez","Halsey"],a:0},
    {q:"Chi ha cantato New Rules?",opts:["Dua Lipa","Ariana Grande","Selena Gomez","Halsey"],a:0},
    {q:"Chi ha cantato 7 Rings?",opts:["Dua Lipa","Ariana Grande","Selena Gomez","Halsey"],a:1},
    {q:"Chi ha cantato Thank U Next?",opts:["Dua Lipa","Ariana Grande","Selena Gomez","Halsey"],a:1},
    {q:"Chi ha cantato Perfect?",opts:["Sam Smith","Harry Styles","Ed Sheeran","James Bay"],a:2},
    {q:"Chi ha cantato Thinking Out Loud?",opts:["Sam Smith","Harry Styles","Ed Sheeran","James Bay"],a:2},
    {q:"Chi ha cantato Watermelon Sugar?",opts:["Niall Horan","Louis Tomlinson","Harry Styles","Liam Payne"],a:2},
    {q:"Chi ha cantato Sign of the Times?",opts:["Niall Horan","Louis Tomlinson","Harry Styles","Liam Payne"],a:2},
    {q:"Chi ha cantato Slow Hands?",opts:["Niall Horan","Louis Tomlinson","Harry Styles","Liam Payne"],a:0},
    {q:"Chi ha cantato All Star?",opts:["311","Sublime","No Doubt","Smash Mouth"],a:3},
    {q:"Chi ha cantato Don't Speak?",opts:["311","Sublime","No Doubt","Smash Mouth"],a:2},
    {q:"Chi ha cantato Mambo No. 5?",opts:["Marc Anthony","Lou Bega","Ricky Martin","Enrique Iglesias"],a:1},
    {q:"Chi ha cantato Livin la Vida Loca?",opts:["Marc Anthony","Lou Bega","Ricky Martin","Enrique Iglesias"],a:2},
    {q:"Chi ha cantato Hero?",opts:["Marc Anthony","Enrique Iglesias","Ricky Martin","Lou Bega"],a:1},
    {q:"Chi ha cantato La Isla Bonita?",opts:["Shakira","Ricky Martin","Madonna","Jennifer Lopez"],a:2},
    {q:"Chi ha cantato Vogue?",opts:["Shakira","Ricky Martin","Madonna","Jennifer Lopez"],a:2},
    {q:"Chi ha cantato Waka Waka?",opts:["Jennifer Lopez","Beyoncé","Rihanna","Shakira"],a:3},
    {q:"Chi ha cantato Halo?",opts:["Alicia Keys","Rihanna","Beyoncé","Kelly Rowland"],a:2},
    {q:"Chi ha cantato No One?",opts:["Beyoncé","Rihanna","Alicia Keys","Mary J. Blige"],a:2},
    {q:"Chi ha cantato Piano Man?",opts:["Elton John","Billy Joel","Bruce Springsteen","Tom Petty"],a:1},
    {q:"Chi ha cantato Rocket Man?",opts:["Elton John","Billy Joel","David Bowie","Queen"],a:0},
    {q:"Chi ha cantato Space Oddity?",opts:["Elton John","Billy Joel","David Bowie","Queen"],a:2},
    {q:"Chi ha cantato Heroes?",opts:["Elton John","Billy Joel","David Bowie","Queen"],a:2},
    {q:"Chi ha cantato We Will Rock You?",opts:["Led Zeppelin","The Rolling Stones","Queen","The Who"],a:2},
    {q:"Chi ha cantato Satisfaction?",opts:["Led Zeppelin","The Rolling Stones","Queen","The Who"],a:1},
    {q:"Chi ha cantato Whole Lotta Love?",opts:["Led Zeppelin","The Rolling Stones","Queen","The Who"],a:0},
    {q:"Chi ha cantato My Generation?",opts:["Led Zeppelin","The Rolling Stones","Queen","The Who"],a:3},
    {q:"Chi ha cantato Come Together?",opts:["The Beatles","The Rolling Stones","The Doors","The Kinks"],a:0},
    {q:"Chi ha cantato Light My Fire?",opts:["The Beatles","The Rolling Stones","The Doors","The Kinks"],a:2},
    {q:"Chi ha cantato Hey Jude?",opts:["The Beatles","The Rolling Stones","The Doors","The Kinks"],a:0},
    {q:"Chi ha cantato Let It Be?",opts:["The Beatles","The Rolling Stones","The Doors","The Kinks"],a:0},
    {q:"Chi ha cantato Yesterday?",opts:["The Beatles","The Rolling Stones","The Doors","The Kinks"],a:0},
    {q:"Chi ha cantato Paint It Black?",opts:["The Beatles","The Rolling Stones","The Doors","The Kinks"],a:1},
    {q:"Quante corde ha un violino?",opts:["3","4","5","6"],a:1},
    {q:"Quanti tasti ha un pianoforte standard?",opts:["72","80","88","96"],a:2},
    {q:"Come si chiama la voce femminile più acuta?",opts:["Mezzosoprano","Contralto","Soprano","Mezzo"],a:2},
    {q:"Come si chiama la voce maschile più acuta?",opts:["Tenore","Baritono","Basso","Controtenore"],a:0},
    {q:"Chi ha composto Il Flauto Magico?",opts:["Beethoven","Mozart","Bach","Haydn"],a:1},
    {q:"Chi ha composto La Traviata?",opts:["Puccini","Rossini","Bellini","Verdi"],a:3},
    {q:"Chi ha composto Il Barbiere di Siviglia?",opts:["Puccini","Rossini","Bellini","Verdi"],a:1},
    {q:"Chi ha composto Rigoletto?",opts:["Puccini","Rossini","Bellini","Verdi"],a:3},
    {q:"Chi ha composto La Bohème?",opts:["Puccini","Rossini","Bellini","Verdi"],a:0},
    {q:"Chi ha composto Tosca?",opts:["Puccini","Rossini","Bellini","Verdi"],a:0},
    {q:"Chi ha cantato Lean On?",opts:["Diplo","DJ Snake","Major Lazer e DJ Snake","Calvin Harris"],a:2},
    {q:"Chi ha cantato Animals?",opts:["Avicii","David Guetta","Martin Garrix","Tiesto"],a:2},
    {q:"Chi ha cantato Summer?",opts:["Avicii","Martin Garrix","Calvin Harris","Kygo"],a:2},
  ],
};

// ── CHARACTERS ────────────────────────────────────────────────────────────────
const CHARACTERS = [
  { id: "sofia",  name: "Sofia",  role: "La Dolce",       color: "#a78bfa", gender: "f" },
  { id: "nova",   name: "Nova",   role: "La Cyber",       color: "#22d3ee", gender: "f" },
  { id: "quinn",  name: "Quinn",  role: "La Campionessa", color: "#f59e0b", gender: "f" },
  { id: "flora",  name: "Flora",  role: "La Natura",      color: "#4ade80", gender: "f" },
  { id: "rebel",  name: "Rebel",  role: "La Punk",        color: "#ef4444", gender: "f" },
  { id: "sage",   name: "Sage",   role: "La Studiosa",    color: "#92400e", gender: "f" },
  { id: "pixel",  name: "Pixel",  role: "La Gamer",       color: "#10b981", gender: "f" },
  { id: "jay",    name: "Jay",    role: "Lo Sportivo",    color: "#3b82f6", gender: "m" },
  { id: "leo",    name: "Leo",    role: "L'Avventuriero", color: "#f97316", gender: "m" },
  { id: "rico",   name: "Rico",   role: "Il Cool",        color: "#6366f1", gender: "m" },
  { id: "finn",   name: "Finn",   role: "Il Casual",      color: "#84cc16", gender: "m" },
  { id: "beat",   name: "Beat",   role: "Il DJ",          color: "#eab308", gender: "m" },
  { id: "mimo",   name: "Mimo",   role: "Il Simpatico",   color: "#06b6d4", gender: "m" },
  { id: "nerd",   name: "Nerd",   role: "Il Genio",       color: "#60a5fa", gender: "m" },
];

// ── ROOMS ─────────────────────────────────────────────────────────────────────
const rooms = {}; // { code: roomObj }
const socketRoom = {}; // { socketId: code }

function createRoom() {
  const code = generateCode();
  rooms[code] = {
    code,
    tvSocketId:        null,
    players:           {},
    gameState:         'lobby',
    currentSubject:    null,
    currentQ:          0,
    roundQuestions:    [],
    timerInterval:     null,
    timeLeft:          15,
    roundNumber:       0,
    maxRounds:         1,
    difficulty:        'medium',
    correctAnswerCount: 0,
    usedQuestions:     {},
  };
  return rooms[code];
}

function getRoom(code) { return rooms[code]; }

function getRoomBySocket(socketId) {
  const code = socketRoom[socketId];
  return code ? rooms[code] : null;
}

function getPlayersList(room) {
  return Object.values(room.players).map(p => ({
    name: p.name, char: p.char, score: p.score, answered: p.answered,
  }));
}

function emitToRoom(room, event, data) {
  io.to(room.code).emit(event, data);
}

function startTimer(room) {
  room.timeLeft = 15;
  clearInterval(room.timerInterval);
  room.timerInterval = setInterval(() => {
    room.timeLeft--;
    emitToRoom(room, 'timer', { timeLeft: room.timeLeft });
    if (room.timeLeft <= 0) { clearInterval(room.timerInterval); revealAnswer(room); }
  }, 1000);
}

function revealAnswer(room) {
  clearInterval(room.timerInterval);
  room.gameState = 'reveal';
  const q = room.roundQuestions[room.currentQ];
  emitToRoom(room, 'reveal', { correctIndex: q.a, players: getPlayersList(room) });
  setTimeout(() => {
    room.currentQ++;
    if (room.currentQ >= room.roundQuestions.length) endRound(room);
    else sendQuestion(room);
  }, 3000);
}

function sendQuestion(room) {
  if (!room.roundQuestions || room.roundQuestions.length === 0) return;
  room.gameState = 'question';
  Object.values(room.players).forEach(p => p.answered = false);
  room.correctAnswerCount = 0;
  const q    = room.roundQuestions[room.currentQ];
  const subj = SUBJECTS.find(s => s.id === room.currentSubject);
  emitToRoom(room, 'question', {
    index:   room.currentQ,
    total:   room.roundQuestions.length,
    subject: subj ? subj.name : '',
    emoji:   subj ? subj.emoji : '',
    q:       q.q,
    yt:      q.yt || null,
    opts:    q.opts,
    players: getPlayersList(room),
  });
  startTimer(room);
}

function endRound(room) {
  room.gameState = 'round-end';
  room.roundNumber++;
  const sorted      = getPlayersList(room).sort((a, b) => b.score - a.score);
  const isLastRound = room.roundNumber >= room.maxRounds;
  emitToRoom(room, 'round-end', { players: sorted, roundNumber: room.roundNumber, maxRounds: room.maxRounds, isLastRound });
}

function pickQuestionsInRoom(room, pool, subjectId) {
  if (!room.usedQuestions[subjectId]) room.usedQuestions[subjectId] = new Set();
  const used = room.usedQuestions[subjectId];
  let available = pool.map((q, i) => ({q, i})).filter(({i}) => !used.has(i));
  if (available.length < 10) { used.clear(); available = pool.map((q, i) => ({q, i})); }
  const picked = shuffle(available).slice(0, 10);
  picked.forEach(({i}) => used.add(i));
  return picked.map(({q}) => q);
}

// Cleanup empty rooms after 2 hours
setInterval(() => {
  const now = Date.now();
  Object.keys(rooms).forEach(code => {
    const room = rooms[code];
    if (Object.keys(room.players).length === 0 && !room.tvSocketId) {
      delete rooms[code];
      console.log('Room', code, 'cleaned up');
    }
  });
}, 1000 * 60 * 30);

// ── QR ROUTE ──────────────────────────────────────────────────────────────────
app.get('/qr', async (req, res) => {
  const host = req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const url  = `${proto}://${host}/phone`;
  try {
    const qr = await QRCode.toDataURL(url, { width: 180, margin: 1 });
    res.json({ qr, url });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SOCKET.IO ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('Connesso:', socket.id);

  socket.on('register-tv', () => {
    // Create a new room for this TV
    const room = createRoom();
    room.tvSocketId = socket.id;
    socketRoom[socket.id] = room.code;
    socket.join(room.code);
    socket.emit('room-info', { code: room.code, players: [], subjects: SUBJECTS });
    console.log('TV registrata, stanza:', room.code);
  });

  socket.on('join', ({ code, name, charId }) => {
    const room = getRoom(code);
    if (!room)                  { socket.emit('join-error', { msg: 'Codice non valido!' }); return; }
    if (room.gameState !== 'lobby') { socket.emit('join-error', { msg: 'La partita è già iniziata!' }); return; }
    const charTaken = Object.values(room.players).some(p => p.char.id === charId);
    if (charTaken) { socket.emit('join-error', { msg: 'Personaggio già scelto da qualcun altro!' }); return; }
    const char = CHARACTERS.find(c => c.id === charId);
    room.players[socket.id] = { socketId: socket.id, name, char, score: 0, answered: false };
    socketRoom[socket.id] = code;
    socket.join(code);
    socket.emit('joined', { name, char });
    emitToRoom(room, 'players-update', { players: getPlayersList(room) });
    console.log(`${name} (${char.name}) si è unito alla stanza ${code}`);
  });

  socket.on('start-game', ({ rounds, difficulty }) => {
    const room = getRoomBySocket(socket.id);
    if (!room || Object.keys(room.players).length < 1) return;
    room.maxRounds   = rounds || 1;
    room.difficulty  = difficulty || 'medium';
    room.gameState   = 'subject-select';
    room.roundNumber = 0;
    Object.values(room.players).forEach(p => p.score = 0);
    emitToRoom(room, 'choose-subject', { subjects: SUBJECTS, roundNumber: 0, maxRounds: room.maxRounds });
  });

  socket.on('select-subject', ({ subjectId }) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    const subj = SUBJECTS.find(s => s.id === subjectId);
    if (!subj) return;
    room.currentSubject = subjectId;
    room.currentQ       = 0;
    emitToRoom(room, 'subject-selected', { subject: subj.name, emoji: subj.emoji, subjectId });
    fetchOnlineQuestions(subjectId, room.difficulty).then(onlineQ => {
      room.roundQuestions = onlineQ || pickQuestionsInRoom(room, QUESTIONS[subjectId], subjectId);
      room.gameState = 'question-pending';
      setTimeout(() => sendQuestion(room), 2500);
    });
  });

  socket.on('random-subject', () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    const available = SUBJECTS.filter(s => s.id !== room.currentSubject);
    const subj      = available[Math.floor(Math.random() * available.length)];
    room.currentSubject = subj.id;
    room.currentQ       = 0;
    emitToRoom(room, 'subject-selected', { subject: subj.name, emoji: subj.emoji, subjectId: subj.id });
    fetchOnlineQuestions(subj.id, room.difficulty).then(onlineQ => {
      room.roundQuestions = onlineQ || pickQuestionsInRoom(room, QUESTIONS[subj.id], subj.id);
      room.gameState = 'question-pending';
      setTimeout(() => sendQuestion(room), 2500);
    });
  });

  socket.on('next-round', () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    room.gameState = 'subject-select';
    emitToRoom(room, 'choose-subject', { subjects: SUBJECTS, roundNumber: room.roundNumber, maxRounds: room.maxRounds });
  });

  socket.on('end-game', () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    room.gameState = 'podium';
    const sorted   = getPlayersList(room).sort((a, b) => b.score - a.score);
    emitToRoom(room, 'podium', { players: sorted });
  });

  socket.on('answer', ({ index, answerIndex }) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    if (room.gameState !== 'question' && room.gameState !== 'question-pending') return;
    if (index !== room.currentQ) return;
    const player = room.players[socket.id];
    if (!player || player.answered) return;
    player.answered = true;
    const q       = room.roundQuestions[room.currentQ];
    const correct = answerIndex === q.a;
    let pts = 0, bonus = 0;
    if (correct) {
      pts = Math.max(1, room.timeLeft);
      if (room.correctAnswerCount === 0) bonus = 5;
      else if (room.correctAnswerCount === 1) bonus = 3;
      else if (room.correctAnswerCount === 2) bonus = 1;
      room.correctAnswerCount++;
      pts += bonus;
    }
    player.score += pts;
    socket.emit('answer-result', { correct, pts, bonus, score: player.score });
    emitToRoom(room, 'player-answered', { name: player.name, players: getPlayersList(room) });
    const allAnswered = Object.values(room.players).every(p => p.answered);
    if (allAnswered) { clearInterval(room.timerInterval); revealAnswer(room); }
  });

  socket.on('reset-game', () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    // Reset room state
    Object.keys(room.players).forEach(sid => {
      delete socketRoom[sid];
    });
    room.players           = {};
    room.gameState         = 'lobby';
    room.currentQ          = 0;
    room.currentSubject    = null;
    room.roundNumber       = 0;
    room.maxRounds         = 1;
    room.correctAnswerCount = 0;
    clearInterval(room.timerInterval);
    // Generate new code
    const oldCode = room.code;
    const newCode = generateCode();
    room.code = newCode;
    rooms[newCode] = room;
    delete rooms[oldCode];
    socketRoom[socket.id] = newCode;
    socket.leave(oldCode);
    socket.join(newCode);
    emitToRoom(room, 'reset', { code: newCode });
  });

  socket.on('disconnect', () => {
    const room = getRoomBySocket(socket.id);
    if (room) {
      if (room.players[socket.id]) {
        const name = room.players[socket.id].name;
        delete room.players[socket.id];
        emitToRoom(room, 'players-update', { players: getPlayersList(room) });
        console.log(`${name} disconnesso dalla stanza ${room.code}`);
      }
      if (room.tvSocketId === socket.id) {
        room.tvSocketId = null;
        console.log(`TV disconnessa dalla stanza ${room.code}`);
      }
    }
    delete socketRoom[socket.id];
  });
});

// ── START ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎮 Quiz Game avviato sulla porta ${PORT}!`);
  console.log(`📺 Schermata TV:     http://localhost:${PORT}/tv`);
  console.log(`📱 Telefono:         http://localhost:${PORT}/phone\n`);
});
