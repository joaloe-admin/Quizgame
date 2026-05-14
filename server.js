const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/img', express.static(path.join(__dirname, 'public', 'img')));
app.get('/tv',    (req, res) => res.sendFile(path.join(__dirname, 'public', 'tv.html')));
app.get('/phone', (req, res) => res.sendFile(path.join(__dirname, 'public', 'phone.html')));

app.get('/imgproxy', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('Missing url');
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'QuizGame/1.0' } });
    if (!response.ok) return res.status(404).send('Not found');
    const buffer = await response.arrayBuffer();
    res.set('Content-Type', response.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(buffer));
  } catch(e) { res.status(500).send('Error'); }
});

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }
function generateCode() { return String(Math.floor(1000 + Math.random() * 9000)); }

const wikiImageCache = {};
async function getWikiImage(wikiTitle) {
  if (wikiImageCache[wikiTitle]) return wikiImageCache[wikiTitle];
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiTitle)}&prop=pageimages&format=json&pithumbsize=400&origin=*`;
    const res = await fetch(url, { headers: { 'User-Agent': 'QuizGame/1.0', 'Accept': 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const img = Object.values(data?.query?.pages || {})[0]?.thumbnail?.source || null;
    if (img) wikiImageCache[wikiTitle] = img;
    return img;
  } catch(e) { return null; }
}

const FAMOUS_ITALIANS = {
  arte: [
    { name: 'Leonardo da Vinci', wiki: 'Leonardo_da_Vinci' },
    { name: 'Michelangelo', wiki: 'Michelangelo' },
    { name: 'Raffaello Sanzio', wiki: 'Raphael' },
    { name: 'Sandro Botticelli', wiki: 'Sandro_Botticelli' },
    { name: 'Caravaggio', wiki: 'Caravaggio' },
    { name: 'Tiziano Vecellio', wiki: 'Titian' },
    { name: 'Amedeo Modigliani', wiki: 'Amedeo_Modigliani' },
  ],
  musica: [
    { name: 'Lucio Battisti', wiki: 'Lucio_Battisti' },
    { name: 'Fabrizio De André', wiki: 'Fabrizio_De_André' },
    { name: 'Vasco Rossi', wiki: 'Vasco_Rossi' },
    { name: 'Luciano Pavarotti', wiki: 'Luciano_Pavarotti' },
    { name: 'Andrea Bocelli', wiki: 'Andrea_Bocelli' },
    { name: 'Laura Pausini', wiki: 'Laura_Pausini' },
    { name: 'Tiziano Ferro', wiki: 'Tiziano_Ferro' },
    { name: 'Jovanotti', wiki: 'Jovanotti' },
    { name: 'Mina', wiki: 'Mina_(Italian_singer)' },
    { name: 'Adriano Celentano', wiki: 'Adriano_Celentano' },
    { name: 'Marco Mengoni', wiki: 'Marco_Mengoni' },
  ],
  cinema: [
    { name: 'Roberto Benigni', wiki: 'Roberto_Benigni' },
    { name: 'Sophia Loren', wiki: 'Sophia_Loren' },
    { name: 'Marcello Mastroianni', wiki: 'Marcello_Mastroianni' },
    { name: 'Monica Bellucci', wiki: 'Monica_Bellucci' },
    { name: 'Alberto Sordi', wiki: 'Alberto_Sordi' },
    { name: 'Totò', wiki: 'Totò_(actor)' },
    { name: 'Anna Magnani', wiki: 'Anna_Magnani' },
  ],
  sport: [
    { name: 'Valentino Rossi', wiki: 'Valentino_Rossi' },
    { name: 'Francesco Totti', wiki: 'Francesco_Totti' },
    { name: 'Roberto Baggio', wiki: 'Roberto_Baggio' },
    { name: 'Paolo Maldini', wiki: 'Paolo_Maldini' },
    { name: 'Federica Pellegrini', wiki: 'Federica_Pellegrini' },
    { name: 'Fausto Coppi', wiki: 'Fausto_Coppi' },
    { name: 'Jannik Sinner', wiki: 'Jannik_Sinner' },
    { name: 'Alessandro Del Piero', wiki: 'Alessandro_Del_Piero' },
  ],
  scienza: [
    { name: 'Galileo Galilei', wiki: 'Galileo_Galilei' },
    { name: 'Alessandro Volta', wiki: 'Alessandro_Volta' },
    { name: 'Enrico Fermi', wiki: 'Enrico_Fermi' },
    { name: 'Guglielmo Marconi', wiki: 'Guglielmo_Marconi' },
    { name: 'Rita Levi-Montalcini', wiki: 'Rita_Levi-Montalcini' },
  ],
  politica: [
    { name: 'Silvio Berlusconi', wiki: 'Silvio_Berlusconi' },
    { name: 'Romano Prodi', wiki: 'Romano_Prodi' },
    { name: 'Mario Draghi', wiki: 'Mario_Draghi' },
    { name: 'Giorgia Meloni', wiki: 'Giorgia_Meloni' },
    { name: 'Giuseppe Garibaldi', wiki: 'Giuseppe_Garibaldi' },
  ],
  letteratura: [
    { name: 'Dante Alighieri', wiki: 'Dante_Alighieri' },
    { name: 'Italo Calvino', wiki: 'Italo_Calvino' },
    { name: 'Umberto Eco', wiki: 'Umberto_Eco' },
    { name: 'Alessandro Manzoni', wiki: 'Alessandro_Manzoni' },
    { name: 'Primo Levi', wiki: 'Primo_Levi' },
  ],
  moda: [
    { name: 'Giorgio Armani', wiki: 'Giorgio_Armani' },
    { name: 'Gianni Versace', wiki: 'Gianni_Versace' },
    { name: 'Miuccia Prada', wiki: 'Miuccia_Prada' },
  ],
};

const FAMOUS_PLACES = [
  { name: 'Colosseo', wiki: 'Colosseum' }, { name: 'Torre Eiffel', wiki: 'Eiffel_Tower' },
  { name: 'Sagrada Família', wiki: 'Sagrada_Família' }, { name: 'Big Ben', wiki: 'Big_Ben' },
  { name: 'Statue of Liberty', wiki: 'Statue_of_Liberty' }, { name: 'Machu Picchu', wiki: 'Machu_Picchu' },
  { name: 'Taj Mahal', wiki: 'Taj_Mahal' }, { name: 'Piramidi di Giza', wiki: 'Egyptian_pyramids' },
  { name: 'Torre di Pisa', wiki: 'Leaning_Tower_of_Pisa' }, { name: 'Partenone', wiki: 'Parthenon' },
  { name: 'Cristo Redentore', wiki: 'Christ_the_Redeemer_(statue)' }, { name: 'Burj Khalifa', wiki: 'Burj_Khalifa' },
  { name: 'Sydney Opera House', wiki: 'Sydney_Opera_House' }, { name: 'Stonehenge', wiki: 'Stonehenge' },
  { name: 'Alhambra', wiki: 'Alhambra' }, { name: 'Hagia Sophia', wiki: 'Hagia_Sophia' },
  { name: 'Duomo di Milano', wiki: 'Milan_Cathedral' }, { name: 'Fontana di Trevi', wiki: 'Trevi_Fountain' },
  { name: 'Pantheon', wiki: 'Pantheon,_Rome' }, { name: 'Petra', wiki: 'Petra,_Jordan' },
  { name: 'Golden Gate Bridge', wiki: 'Golden_Gate_Bridge' }, { name: 'Grand Canyon', wiki: 'Grand_Canyon' },
  { name: 'Great Wall of China', wiki: 'Great_Wall_of_China' }, { name: 'Angkor Wat', wiki: 'Angkor_Wat' },
  { name: 'Canal Grande', wiki: 'Grand_Canal,_Venice' }, { name: 'Chichen Itza', wiki: 'Chichen_Itza' },
];

const FAMOUS_ARTWORKS = [
  { name: 'La Gioconda', wiki: 'Mona_Lisa' }, { name: 'La Notte Stellata', wiki: 'The_Starry_Night' },
  { name: 'La Nascita di Venere', wiki: 'The_Birth_of_Venus' }, { name: 'Guernica', wiki: 'Guernica_(Picasso)' },
  { name: 'Il Bacio', wiki: 'The_Kiss_(Klimt)' }, { name: 'La Persistenza della Memoria', wiki: 'The_Persistence_of_Memory' },
  { name: "L'Urlo", wiki: 'The_Scream' }, { name: "Ragazza con l'orecchino di perla", wiki: 'Girl_with_a_Pearl_Earring' },
  { name: 'I Girasoli', wiki: 'Sunflowers_(Van_Gogh_series)' }, { name: 'La Grande Onda', wiki: 'The_Great_Wave_off_Kanagawa' },
  { name: 'La Libertà guida il Popolo', wiki: 'Liberty_Leading_the_People' }, { name: 'Le Ninfee', wiki: 'Water_Lilies_(Monet_series)' },
  { name: 'Venere di Milo', wiki: 'Venus_de_Milo' }, { name: 'Il Pensatore', wiki: 'The_Thinker' },
];

const FAMOUS_ANIMALS = [
  { name: 'Leone', wiki: 'Lion' }, { name: 'Elefante africano', wiki: 'African_elephant' },
  { name: 'Panda gigante', wiki: 'Giant_panda' }, { name: 'Koala', wiki: 'Koala' },
  { name: 'Gorilla', wiki: 'Gorilla' }, { name: 'Ghepardo', wiki: 'Cheetah' },
  { name: 'Fenicottero', wiki: 'Flamingo' }, { name: 'Polpo', wiki: 'Octopus' },
  { name: 'Pinguino imperatore', wiki: 'Emperor_penguin' }, { name: 'Orso polare', wiki: 'Polar_bear' },
  { name: 'Giraffa', wiki: 'Giraffe' }, { name: 'Ornitorinco', wiki: 'Platypus' },
  { name: 'Tucano', wiki: 'Toucan' }, { name: 'Axolotl', wiki: 'Axolotl' },
  { name: 'Rinoceronte', wiki: 'Rhinoceros' }, { name: 'Delfino', wiki: 'Dolphin' },
];

const VERO_FALSO = [
  { q: 'La muraglia cinese è visibile dallo spazio a occhio nudo.', a: false, explain: 'È un mito! È troppo stretta per essere vista dallo spazio.' },
  { q: "L'Italia ha vinto 4 Mondiali di calcio.", a: true, explain: '1934, 1938, 1982 e 2006.' },
  { q: 'Il cuore di un polpo batte 3 volte.', a: true, explain: 'Ha 3 cuori: uno principale e due branchiali.' },
  { q: 'Napoleone era alto meno di 1,60 m.', a: false, explain: "Era alto circa 1,69 m, nella media per l'epoca." },
  { q: "Il Monte Bianco è la montagna più alta d'Europa.", a: true, explain: 'Con i suoi 4.808 m è la più alta d\'Europa occidentale.' },
  { q: "L'oro affonda nell'acqua.", a: true, explain: "L'oro è molto denso, circa 19 volte più dell'acqua." },
  { q: 'Il Vaticano è il paese più piccolo del mondo.', a: true, explain: 'Con soli 0,44 km² è lo stato più piccolo al mondo.' },
  { q: 'Il sangue delle aragoste è rosso.', a: false, explain: 'Il sangue delle aragoste è blu, per il rame al posto del ferro.' },
  { q: "L'Italia ha più siti UNESCO di qualsiasi altro paese.", a: true, explain: "L'Italia è il paese con più siti UNESCO al mondo." },
  { q: 'Gli elefanti sono i soli mammiferi che non possono saltare.', a: true, explain: 'Il loro peso non lo consente.' },
  { q: 'La torre di Pisa è inclinata verso est.', a: false, explain: 'È inclinata verso sud.' },
  { q: 'La pizza Margherita prende il nome da Margherita di Savoia.', a: true, explain: 'Fu creata nel 1889 in onore della regina.' },
  { q: 'Dante Alighieri è nato a Firenze.', a: true, explain: 'Dante nacque a Firenze intorno al 1265.' },
  { q: 'La Gioconda è dipinta su tela.', a: false, explain: 'È dipinta su tavola di legno di pioppo.' },
  { q: 'Il Vesuvio è ancora un vulcano attivo.', a: true, explain: 'Il Vesuvio è considerato uno dei vulcani più pericolosi al mondo.' },
  { q: 'Leonardo da Vinci era mancino.', a: true, explain: 'Leonardo scriveva con la mano sinistra da destra a sinistra.' },
  { q: 'Il gelato è stato inventato in Italia.', a: true, explain: 'Il gelato moderno ha origini fiorentine del XVI secolo.' },
  { q: 'Venezia è costruita su 118 isole.', a: true, explain: 'Venezia è composta da 118 isolette collegate da ponti.' },
  { q: "L'alfabeto italiano ha 21 lettere.", a: true, explain: "L'alfabeto italiano ha 21 lettere: mancano J, K, W, X, Y." },
  { q: 'La pizza napoletana è patrimonio UNESCO.', a: true, explain: 'La pizza napoletana è patrimonio immateriale UNESCO dal 2017.' },
  { q: "L'Etna è il vulcano più alto d'Europa.", a: true, explain: "Con i suoi 3.357 m è il più alto vulcano attivo d'Europa." },
  { q: 'Galileo Galilei è nato a Pisa.', a: true, explain: 'Galileo nacque a Pisa nel 1564.' },
  { q: 'I galli non depongono uova.', a: true, explain: 'Le uova le depongono le galline, non i galli!' },
  { q: 'Un pesce rosso ha una memoria di soli 3 secondi.', a: false, explain: 'I pesci rossi possono ricordare eventi per mesi.' },
  { q: "Mercurio è il pianeta più caldo del sistema solare.", a: false, explain: "Venere è più caldo grazie all'effetto serra." },
  { q: "L'acqua può bollire a meno di 100°C.", a: true, explain: "Ad alta quota la pressione è minore e l'acqua bolle prima." },
  { q: 'La Ferrari è stata fondata a Maranello.', a: true, explain: 'Enzo Ferrari fondò la Ferrari a Maranello nel 1947.' },
  { q: "Il Po è il fiume più lungo d'Italia.", a: true, explain: 'Il Po misura 652 km.' },
  { q: 'Roma ha più fontane di qualsiasi altra città al mondo.', a: true, explain: 'Roma ha oltre 2.000 fontane storiche.' },
];

const QUESTIONS_ITALIA = [
  {q:"Qual è la capitale d'Italia?",opts:["Milano","Napoli","Roma","Torino"],a:2},
  {q:"Quante regioni ha l'Italia?",opts:["18","19","20","21"],a:2},
  {q:"Qual è il fiume più lungo d'Italia?",opts:["Tevere","Arno","Adige","Po"],a:3},
  {q:"Qual è la montagna più alta d'Italia?",opts:["Gran Paradiso","Monte Rosa","Monte Bianco","Cervino"],a:2},
  {q:"In quale anno fu proclamata la Repubblica Italiana?",opts:["1944","1945","1946","1947"],a:2},
  {q:"Qual è il lago più grande d'Italia?",opts:["Lago di Como","Lago Maggiore","Lago di Garda","Lago Trasimeno"],a:2},
  {q:"Quale città italiana è conosciuta come 'La Serenissima'?",opts:["Firenze","Venezia","Genova","Pisa"],a:1},
  {q:"Qual è il vulcano più alto d'Europa?",opts:["Vesuvio","Stromboli","Vulcano","Etna"],a:3},
  {q:"Quale città è capoluogo della Toscana?",opts:["Siena","Pisa","Livorno","Firenze"],a:3},
  {q:"Qual è l'inno nazionale italiano?",opts:["Va' Pensiero","O Sole Mio","Fratelli d'Italia","Bella Ciao"],a:2},
  {q:"Chi ha scritto 'I Promessi Sposi'?",opts:["Dante","Leopardi","Manzoni","Verga"],a:2},
  {q:"In quale città si trova la Torre pendente?",opts:["Firenze","Siena","Pisa","Lucca"],a:2},
  {q:"In quale anno l'Italia ha adottato l'Euro?",opts:["1999","2000","2001","2002"],a:3},
  {q:"Quale squadra ha vinto più campionati di Serie A?",opts:["Milan","Inter","Roma","Juventus"],a:3},
  {q:"In quale città si trova il Colosseo?",opts:["Napoli","Roma","Milano","Torino"],a:1},
  {q:"Quante volte ha vinto l'Italia la Coppa del Mondo di calcio?",opts:["2","3","4","5"],a:2},
  {q:"Chi è l'autore della Divina Commedia?",opts:["Petrarca","Boccaccio","Dante Alighieri","Ariosto"],a:2},
  {q:"In quale regione si trova Matera?",opts:["Puglia","Calabria","Basilicata","Campania"],a:2},
  {q:"Quale città italiana è famosa per la produzione di moda?",opts:["Roma","Napoli","Milano","Torino"],a:2},
  {q:"Chi ha composto 'Va' Pensiero'?",opts:["Puccini","Rossini","Bellini","Verdi"],a:3},
  {q:"Quale città italiana è famosa per il Carnevale?",opts:["Roma","Napoli","Venezia","Firenze"],a:2},
  {q:"Chi era Garibaldi?",opts:["Poeta","Pittore","Eroe del Risorgimento","Filosofo"],a:2},
  {q:"In quale anno fu unificata l'Italia?",opts:["1848","1861","1870","1876"],a:1},
  {q:"Qual è la pizza più famosa di Napoli?",opts:["Pizza Romana","Pizza Margherita","Pizza Capricciosa","Pizza Diavola"],a:1},
  {q:"In quale regione si trova Pompei?",opts:["Lazio","Calabria","Sicilia","Campania"],a:3},
  {q:"Quale isola italiana è la più grande del Mediterraneo?",opts:["Sardegna","Sicilia","Elba","Capri"],a:1},
  {q:"In quale città si trova La Scala?",opts:["Roma","Torino","Milano","Venezia"],a:2},
  {q:"Quale città italiana è famosa per il prosciutto?",opts:["Bologna","Parma","Modena","Ferrara"],a:1},
  {q:"Quale città italiana è soprannominata 'La Grassa'?",opts:["Milano","Torino","Bologna","Parma"],a:2},
  {q:"Quale regione produce il Chianti?",opts:["Umbria","Piemonte","Toscana","Veneto"],a:2},
  {q:"Chi ha fondato la Fiat?",opts:["Pirelli","Agnelli","Berlusconi","Barilla"],a:1},
  {q:"Quale città è famosa per il Festival del Cinema?",opts:["Roma","Milano","Venezia","Torino"],a:2},
  {q:"Quale squadra italiana ha vinto più volte la Champions League?",opts:["Juventus","Inter","Milan","Roma"],a:2},
  {q:"In quale regione si trova Alberobello con i suoi trulli?",opts:["Basilicata","Calabria","Puglia","Campania"],a:2},
  {q:"Chi ha inventato il barometro?",opts:["Volta","Galileo","Torricelli","Fermi"],a:2},
  {q:"Quale scienziato italiano ha scoperto la pila elettrica?",opts:["Fermi","Marconi","Volta","Meucci"],a:2},
  {q:"In quale anno Cristoforo Colombo scoprì l'America?",opts:["1488","1490","1492","1498"],a:2},
  {q:"Chi ha scritto 'Il Principe'?",opts:["Dante","Machiavelli","Boccaccio","Ariosto"],a:1},
  {q:"In quale città si trova il Cenacolo di Leonardo?",opts:["Roma","Firenze","Venezia","Milano"],a:3},
  {q:"Qual è il vino più famoso del Piemonte?",opts:["Brunello","Chianti","Barolo","Amarone"],a:2},
  {q:"Quale città italiana è famosa per il tartufo bianco?",opts:["Bologna","Parma","Alba","Cuneo"],a:2},
  {q:"Chi ha scritto 'Le avventure di Pinocchio'?",opts:["De Amicis","Rodari","Collodi","Salgari"],a:2},
  {q:"Qual è il piatto tipico romano?",opts:["Risotto","Pasta alla carbonara","Pesto","Ribollita"],a:1},
  {q:"Chi è il più grande tennista italiano di tutti i tempi?",opts:["Sinner","Berrettini","Panatta","Barazzutti"],a:2},
  {q:"Dove nasce il Parmigiano Reggiano?",opts:["Parma","Reggio Emilia","Modena","Entrambe A e B"],a:3},
];

const QUESTIONS_GASTRONOMIA = [
  {q:"Qual è l'ingrediente principale del guacamole?",opts:["Pomodoro","Cipolla","Avocado","Peperoncino"],a:2},
  {q:"Da quale paese proviene il sushi?",opts:["Cina","Tailandia","Giappone","Vietnam"],a:2},
  {q:"Cosa significa 'al dente' in cucina?",opts:["Ben cotto","Crudo","Leggermente sodo","Scondito"],a:2},
  {q:"Quale formaggio si usa nella carbonara tradizionale?",opts:["Parmigiano","Grana","Pecorino Romano","Ricotta"],a:2},
  {q:"Da quale pianta si ricava il cioccolato?",opts:["Vaniglia","Cacao","Cannella","Noce moscata"],a:1},
  {q:"Quale è la base della paella spagnola?",opts:["Pasta","Patate","Riso","Mais"],a:2},
  {q:"Da quale paese proviene il kimchi?",opts:["Giappone","Cina","Tailandia","Corea"],a:3},
  {q:"Quale spezia è la più cara al mondo?",opts:["Vaniglia","Cannella","Cardamomo","Zafferano"],a:3},
  {q:"Quale formaggio francese è famoso per la muffa blu?",opts:["Brie","Camembert","Roquefort","Comté"],a:2},
  {q:"Qual è l'ingrediente base del pesto genovese?",opts:["Spinaci","Prezzemolo","Basilico","Rucola"],a:2},
  {q:"Quale è il pesce usato nel baccalà?",opts:["Merluzzo","Aringa","Salmone","Tonno"],a:0},
  {q:"Qual è il principale ingrediente del falafel?",opts:["Lenticchie","Ceci","Fagioli","Soia"],a:1},
  {q:"Come si chiama il formaggio greco in salamoia?",opts:["Halloumi","Mizithra","Feta","Kasseri"],a:2},
  {q:"Da quale paese proviene il croissant?",opts:["Francia","Austria","Italia","Svizzera"],a:1},
  {q:"Cos'è la crème brûlée?",opts:["Mousse al cioccolato","Budino con copertura caramellata","Soufflé","Panna cotta"],a:1},
  {q:"Cos'è il sake?",opts:["Birra di riso","Vino di riso giapponese","Liquore di prugne","Tè fermentato"],a:1},
  {q:"Qual è l'ingrediente principale del risotto alla milanese?",opts:["Tartufo","Zafferano","Porcini","Grana"],a:1},
  {q:"Come si chiama il burro chiarificato indiano?",opts:["Paneer","Lassi","Ghee","Masala"],a:2},
  {q:"Quale dolce napoletano è fatto di pasta frolla e crema?",opts:["Sfogliatella","Cannolo","Pastiera","Zeppola"],a:2},
  {q:"Quale piatto è tipico della cucina peruviana?",opts:["Ceviche","Tacos","Empanadas","Arepas"],a:0},
  {q:"Da dove proviene la piadina?",opts:["Toscana","Emilia-Romagna","Veneto","Marche"],a:1},
  {q:"Cosa è la 'nduja?",opts:["Salame piccante spalmabile calabrese","Formaggio","Pasta","Sugo"],a:0},
  {q:"Quale è il dolce tradizionale siciliano?",opts:["Pastiera","Cannolo","Zeppola","Sfogliatella"],a:1},
  {q:"Cosa si usa per fare il tofu?",opts:["Riso","Soia","Latte","Grano"],a:1},
  {q:"Dove nasce il Parmigiano Reggiano?",opts:["Parma","Reggio Emilia","Modena","Entrambe A e B"],a:3},
  {q:"Cosa si intende per 'umami'?",opts:["Dolce","Acido","Sapido/saporito","Amaro"],a:2},
  {q:"Quale condimento è base della cucina toscana?",opts:["Burro","Olio extravergine d'oliva","Strutto","Lardo"],a:1},
];

const QUESTIONS_MUSICA = [
  {q:"Chi ha composto le Quattro Stagioni?",opts:["Bach","Handel","Vivaldi","Corelli"],a:2},
  {q:"Qual è il nome della band di Freddie Mercury?",opts:["Led Zeppelin","Queen","The Rolling Stones","Pink Floyd"],a:1},
  {q:"Chi è il Re del Pop?",opts:["Elvis Presley","Prince","Michael Jackson","David Bowie"],a:2},
  {q:"Chi ha cantato Rolling in the Deep?",opts:["Beyoncé","Rihanna","Adele","Amy Winehouse"],a:2},
  {q:"Chi ha cantato Like a Prayer?",opts:["Whitney Houston","Madonna","Mariah Carey","Celine Dion"],a:1},
  {q:"Quale band ha inciso Hotel California?",opts:["The Doors","Eagles","Fleetwood Mac","Crosby Stills Nash"],a:1},
  {q:"Chi ha cantato Billie Jean?",opts:["Prince","James Brown","Michael Jackson","Stevie Wonder"],a:2},
  {q:"Quale band ha inciso Stairway to Heaven?",opts:["Deep Purple","Black Sabbath","Led Zeppelin","Jimi Hendrix"],a:2},
  {q:"Chi ha cantato Smells Like Teen Spirit?",opts:["Pearl Jam","Soundgarden","Nirvana","Alice in Chains"],a:2},
  {q:"Chi ha cantato Shape of You?",opts:["Sam Smith","Harry Styles","Ed Sheeran","James Bay"],a:2},
  {q:"Chi ha cantato Bad Guy?",opts:["Lorde","Lana Del Rey","Halsey","Billie Eilish"],a:3},
  {q:"Chi ha cantato Blinding Lights?",opts:["Drake","The Weeknd","Future","Travis Scott"],a:1},
  {q:"Chi ha cantato Anti-Hero?",opts:["Olivia Rodrigo","Billie Eilish","Taylor Swift","Ariana Grande"],a:2},
  {q:"Chi ha cantato Despacito?",opts:["J Balvin","Maluma","Luis Fonsi","Ozuna"],a:2},
  {q:"Chi ha cantato Viva la Vida?",opts:["Radiohead","Muse","Coldplay","U2"],a:2},
  {q:"Chi ha cantato Wonderwall?",opts:["Blur","Pulp","Oasis","Suede"],a:2},
  {q:"Chi ha composto La Traviata?",opts:["Puccini","Rossini","Bellini","Verdi"],a:3},
  {q:"Chi ha composto La Bohème?",opts:["Puccini","Rossini","Bellini","Verdi"],a:0},
  {q:"Chi ha cantato 7 Rings?",opts:["Dua Lipa","Ariana Grande","Selena Gomez","Halsey"],a:1},
  {q:"Chi ha cantato Uptown Funk?",opts:["Bruno Mars","Pharrell Williams","Mark Ronson","Justin Timberlake"],a:2},
  {q:"Chi ha cantato Happy?",opts:["Pharrell Williams","Bruno Mars","Mark Ronson","Robin Thicke"],a:0},
  {q:"Chi ha cantato Take Me to Church?",opts:["Passenger","Hozier","James Bay","Ben Howard"],a:1},
  {q:"Chi ha cantato Piano Man?",opts:["Elton John","Billy Joel","Bruce Springsteen","Tom Petty"],a:1},
  {q:"Chi ha cantato We Will Rock You?",opts:["Led Zeppelin","The Rolling Stones","Queen","The Who"],a:2},
  {q:"Chi ha cantato Hey Jude?",opts:["The Beatles","The Rolling Stones","The Doors","The Kinks"],a:0},
];

const QUESTIONS_SPETTACOLO = [
  {q:"Chi ha interpretato Iron Man nel MCU?",opts:["Chris Evans","Robert Downey Jr.","Chris Hemsworth","Mark Ruffalo"],a:1},
  {q:"In quale anno è uscito il primo Star Wars?",opts:["1975","1977","1979","1981"],a:1},
  {q:"Chi ha scritto Harry Potter?",opts:["Stephenie Meyer","Suzanne Collins","J.K. Rowling","C.S. Lewis"],a:2},
  {q:"Chi ha diretto Titanic?",opts:["Spielberg","Ridley Scott","James Cameron","Nolan"],a:2},
  {q:"Chi interpreta Jack Sparrow nei Pirati dei Caraibi?",opts:["Brad Pitt","Orlando Bloom","Johnny Depp","Tom Hanks"],a:2},
  {q:"Chi ha diretto Il Padrino?",opts:["Spielberg","Coppola","Scorsese","De Palma"],a:1},
  {q:"Quale attore ha interpretato Forrest Gump?",opts:["Tom Cruise","Tom Hanks","Harrison Ford","Kevin Costner"],a:1},
  {q:"Chi ha diretto Inception?",opts:["Spielberg","Cameron","Nolan","Fincher"],a:2},
  {q:"Chi ha diretto Pulp Fiction?",opts:["Coen Brothers","Lynch","Tarantino","Stone"],a:2},
  {q:"Quale attore ha interpretato James Bond più volte?",opts:["Connery","Moore","Brosnan","Craig"],a:1},
  {q:"Quale attore ha interpretato Batman in The Dark Knight?",opts:["Keaton","Kilmer","Clooney","Bale"],a:3},
  {q:"Quale attore ha interpretato il Joker in Joker (2019)?",opts:["Nicholson","Ledger","Phoenix","Leto"],a:2},
  {q:"Chi ha diretto Shining?",opts:["Spielberg","Scorsese","De Palma","Kubrick"],a:3},
  {q:"Quale attore ha interpretato Vito Corleone in Il Padrino?",opts:["Pacino","De Niro","Brando","Nicholson"],a:2},
  {q:"Chi ha interpretato Harry Potter nei film?",opts:["Daniel Radcliffe","Rupert Grint","Tom Felton","Eddie Redmayne"],a:0},
  {q:"Quale attore ha interpretato Jon Snow in Game of Thrones?",opts:["Richard Madden","Kit Harington","Nikolaj Coster-Waldau","Emilia Clarke"],a:1},
  {q:"Quale attore ha interpretato Walter White in Breaking Bad?",opts:["Aaron Paul","Bob Odenkirk","Bryan Cranston","Dean Norris"],a:2},
  {q:"Chi ha diretto Avatar?",opts:["Spielberg","Lucas","Cameron","Scott"],a:2},
  {q:"Chi ha interpretato Jack in Titanic?",opts:["Brad Pitt","Tom Hanks","Leonardo DiCaprio","Matt Damon"],a:2},
  {q:"Chi ha diretto Oppenheimer?",opts:["Spielberg","Scott","Nolan","Villeneuve"],a:2},
  {q:"Chi interpreta Oppenheimer nel film?",opts:["Matt Damon","Cillian Murphy","Tom Hardy","Michael Fassbender"],a:1},
  {q:"Chi ha diretto Barbie (2023)?",opts:["Greta Gerwig","Sofia Coppola","Patty Jenkins","Chloe Zhao"],a:0},
  {q:"Chi interpreta Barbie in Barbie (2023)?",opts:["Zendaya","Margot Robbie","Emma Stone","Florence Pugh"],a:1},
  {q:"Chi ha diretto Parasite?",opts:["Park Chan-wook","Kim Ji-woon","Bong Joon-ho","Lee Chang-dong"],a:2},
  {q:"Chi ha interpretato Tony Soprano?",opts:["James Gandolfini","Michael Imperioli","Steve Buscemi","Edie Falco"],a:0},
  {q:"Chi interpreta Eleven in Stranger Things?",opts:["Sadie Sink","Millie Bobby Brown","Caleb McLaughlin","Gaten Matarazzo"],a:1},
  {q:"In quale città è ambientata Gomorra?",opts:["Roma","Palermo","Napoli","Bari"],a:2},
  {q:"Chi è il creatore di Black Mirror?",opts:["Ryan Murphy","Charlie Brooker","Joss Whedon","J.J. Abrams"],a:1},
];

const QUESTIONS_SPORT = [
  {q:"In quale paese sono nati i Giochi Olimpici?",opts:["Italia","Grecia","Egitto","Turchia"],a:1},
  {q:"Qual è la distanza ufficiale di una maratona?",opts:["40 km","41,5 km","42,195 km","43 km"],a:2},
  {q:"Quale paese ha vinto più Coppe del Mondo di calcio?",opts:["Germania","Argentina","Brasile","Italia"],a:2},
  {q:"Chi è il velocista con il record mondiale dei 100m?",opts:["Carl Lewis","Usain Bolt","Maurice Greene","Tyson Gay"],a:1},
  {q:"Chi ha vinto più titoli del Grande Slam nel tennis maschile?",opts:["Federer","Nadal","Djokovic","Sampras"],a:2},
  {q:"Quante squadre ci sono in Serie A italiana?",opts:["16","18","20","22"],a:2},
  {q:"Chi ha vinto più Mondiali di F1?",opts:["Schumacher","Hamilton","Vettel","Senna"],a:1},
  {q:"Chi ha vinto più Tour de France?",opts:["Merckx","Armstrong","Hinault","Indurain"],a:1},
  {q:"Chi ha segnato più gol nella storia del calcio?",opts:["Pelé","Messi","Ronaldo C.","Romario"],a:2},
  {q:"Chi ha vinto più ori olimpici nel nuoto?",opts:["Spitz","Phelps","Biondi","Popov"],a:1},
  {q:"Chi ha vinto i Mondiali di calcio 2022?",opts:["Francia","Brasile","Argentina","Croazia"],a:2},
  {q:"Chi ha vinto Euro 2020 (giocato nel 2021)?",opts:["Francia","Portogallo","Italia","Inghilterra"],a:2},
  {q:"Quante Coppe del Mondo ha vinto l'Italia?",opts:["2","3","4","5"],a:2},
  {q:"Chi ha vinto più Mondiali di MotoGP?",opts:["Rossi","Agostini","Lorenzo","Marquez"],a:1},
  {q:"Chi è il primo calciatore a vincere 5 Palloni d'Oro?",opts:["Zidane","Ronaldo B.","Messi","Ronaldo C."],a:2},
  {q:"In quale sport si usa il puck?",opts:["Baseball","Hockey su ghiaccio","Curling","Lacrosse"],a:1},
  {q:"Chi ha segnato più gol nei Mondiali di calcio?",opts:["Pelé","Ronaldo B.","Müller","Klose"],a:3},
  {q:"Quante Coppe del Mondo ha vinto la Germania?",opts:["3","4","5","6"],a:1},
  {q:"Quanti punti vale una meta nel rugby?",opts:["3","4","5","6"],a:2},
  {q:"Chi detiene il record mondiale dei 200m?",opts:["Carl Lewis","Usain Bolt","Frank Fredericks","Michael Johnson"],a:1},
];

const QUESTIONS_LOGICA = [
  {q:"Ho città ma non case, montagne ma non alberi, acqua ma non pesci. Cosa sono?",opts:["Un sogno","Una mappa","Un dipinto","Un atlante"],a:1},
  {q:"Più ce n'è, meno si vede. Cosa è?",opts:["Silenzio","Buio","Luce","Nebbia"],a:1},
  {q:"Quanti mesi dell'anno hanno 28 giorni?",opts:["Solo febbraio","Solo 4","Tutti e 12","Solo quelli pari"],a:2},
  {q:"Un gallo depone un uovo sul tetto. Da che parte cade?",opts:["A destra","A sinistra","Verso il basso","I galli non depongono uova"],a:3},
  {q:"Cosa diventa più grande man mano che se ne togli?",opts:["Una buca","Un palloncino","Una torta","Un debito"],a:0},
  {q:"Ho un collo ma non una testa. Cosa sono?",opts:["Una sciarpa","Una bottiglia","Un maglione","Un camino"],a:1},
  {q:"Se ci sono 3 mele e ne prendi 2, quante mele hai?",opts:["0","1","2","3"],a:2},
  {q:"Cosa si rompe senza essere toccato?",opts:["Un uovo","Il silenzio","Il ghiaccio","Un sogno"],a:1},
  {q:"Un contadino ha 17 pecore. Tutte tranne 9 muoiono. Quante ne restano?",opts:["8","9","17","0"],a:1},
  {q:"Cosa viene una volta in un minuto, due volte in un momento, e mai in mille anni?",opts:["La lettera O","La lettera M","La lettera N","La lettera I"],a:1},
  {q:"Cosa può viaggiare in tutto il mondo restando in un angolo?",opts:["La luce","Un francobollo","Internet","Il vento"],a:1},
  {q:"Ha molte chiavi ma non apre nessuna porta. Cosa è?",opts:["Un carcere","Un pianoforte","Un portachiavi rotto","Un ladro"],a:1},
  {q:"Cosa si rompe nel momento in cui lo nomini?",opts:["Il silenzio","Un segreto","La pace","Il ghiaccio"],a:0},
  {q:"Pesa di più un chilo di piume o un chilo di piombo?",opts:["Il piombo","Le piume","Pesano uguale","Dipende dalla densità"],a:2},
  {q:"Cosa vola senza avere ali?",opts:["Il tempo","Un sogno","Il vento","I pensieri"],a:0},
];

const QUESTIONS_ARTE = [
  {q:"Chi ha scolpito il David?",opts:["Donatello","Bernini","Canova","Michelangelo"],a:3},
  {q:"Quale pittore è famoso per i quadri con orologi molli?",opts:["Magritte","Dalí","Ernst","Miró"],a:1},
  {q:"Chi ha dipinto Guernica?",opts:["Dalí","Miró","Picasso","Matisse"],a:2},
  {q:"Chi ha dipinto 'La Nascita di Venere'?",opts:["Tiziano","Raffaello","Botticelli","Caravaggio"],a:2},
  {q:"In quale museo si trova la Gioconda?",opts:["Uffizi","Prado","Louvre","British Museum"],a:2},
  {q:"Quale corrente artistica usava immagini oniriche?",opts:["Impressionismo","Surrealismo","Futurismo","Dadaismo"],a:1},
  {q:"Chi ha scolpito 'Il Pensatore'?",opts:["Bernini","Canova","Rodin","Brancusi"],a:2},
  {q:"Chi ha dipinto 'Il Bacio'?",opts:["Schiele","Klimt","Kokoschka","Moser"],a:1},
  {q:"Dove si trova la Cappella Sistina?",opts:["Firenze","Roma","Vaticano","Napoli"],a:2},
  {q:"Chi ha dipinto 'La Grande Onda' giapponese?",opts:["Hiroshige","Utamaro","Hokusai","Kuniyoshi"],a:2},
  {q:"Quale artista pop è famoso per la zuppa Campbell?",opts:["Lichtenstein","Warhol","Hockney","Johns"],a:1},
  {q:"Chi ha dipinto 'Le Ninfee'?",opts:["Renoir","Degas","Monet","Pissarro"],a:2},
  {q:"In quale città si trovano gli Uffizi?",opts:["Roma","Venezia","Milano","Firenze"],a:3},
];

const QUESTIONS_ANIMALI = [
  {q:"Qual è l'animale terrestre più veloce?",opts:["Leone","Ghepardo","Antilope","Visone"],a:1},
  {q:"Quante zampe ha un ragno?",opts:["6","8","10","12"],a:1},
  {q:"Qual è il mammifero più grande del mondo?",opts:["Elefante","Balena blu","Squalo balena","Orca"],a:1},
  {q:"Quanti cuori ha il polpo?",opts:["1","2","3","4"],a:2},
  {q:"Quale uccello non può volare?",opts:["Falco","Pinguino","Pellicano","Albatro"],a:1},
  {q:"Da dove proviene il Koala?",opts:["Nuova Zelanda","Africa","America del Sud","Australia"],a:3},
  {q:"Quale animale produce la seta?",opts:["Ragno","Baco da seta","Ape","Bruco"],a:1},
  {q:"Quale mammifero è l'unico a volare?",opts:["Lemure","Scoiattolo volante","Pipistrello","Draco"],a:2},
  {q:"Qual è il pesce più grande del mondo?",opts:["Squalo bianco","Manta","Squalo balena","Pesce remo"],a:2},
  {q:"Dove vive il lemure?",opts:["Africa","Asia","Madagascar","Australia"],a:2},
  {q:"Qual è la farfalla migratrice più famosa?",opts:["Macaone","Monarca","Pavone","Vanessa"],a:1},
  {q:"Qual è il mammifero che cammina più lentamente?",opts:["Tartaruga","Koala","Bradipo","Lumaca"],a:2},
  {q:"Da dove proviene il Panda gigante?",opts:["Giappone","Corea","Cina","Tibet"],a:2},
];

// Sfondi per categoria
const CAT_BG = {
  italia:      'linear-gradient(135deg,#009246 0%,#1e40af 50%,#ce2b37 100%)',
  gastronomia: 'linear-gradient(135deg,#f97316 0%,#dc2626 100%)',
  musica:      'linear-gradient(135deg,#7c3aed 0%,#db2777 100%)',
  spettacolo:  'linear-gradient(135deg,#0f172a 0%,#1e3a8a 100%)',
  sport:       'linear-gradient(135deg,#065f46 0%,#1e40af 100%)',
  logica:      'linear-gradient(135deg,#1e3a8a 0%,#6d28d9 100%)',
  arte:        'linear-gradient(135deg,#78350f 0%,#b45309 100%)',
  animali:     'linear-gradient(135deg,#14532d 0%,#166534 100%)',
  verofals:    'linear-gradient(135deg,#1e40af 0%,#0e7490 100%)',
  foto:        'linear-gradient(135deg,#4c1d95 0%,#1e40af 100%)',
  luoghi:      'linear-gradient(135deg,#0c4a6e 0%,#0e7490 100%)',
  opere:       'linear-gradient(135deg,#78350f 0%,#92400e 100%)',
  animaliimg:  'linear-gradient(135deg,#14532d 0%,#065f46 100%)',
  default:     'linear-gradient(135deg,#1e40af 0%,#3b82f6 40%,#06b6d4 100%)',
};

const CAT_LABELS = {
  italia:      { name: 'Italia 🇮🇹',      emoji: '🇮🇹' },
  gastronomia: { name: 'Gastronomia 🍕',  emoji: '🍕' },
  musica:      { name: 'Musica 🎵',        emoji: '🎵' },
  spettacolo:  { name: 'Cinema & TV 🎬',  emoji: '🎬' },
  sport:       { name: 'Sport ⚽',         emoji: '⚽' },
  logica:      { name: 'Logica 🧩',        emoji: '🧩' },
  arte:        { name: 'Arte 🎨',          emoji: '🎨' },
  animali:     { name: 'Animali 🐾',       emoji: '🐾' },
  verofals:    { name: 'Vero o Falso? ✅', emoji: '✅' },
  foto:        { name: 'Chi è? 📸',        emoji: '📸' },
  luoghi:      { name: 'Dove siamo? 🗺️',  emoji: '🗺️' },
  opere:       { name: 'Che opera? 🖼️',   emoji: '🖼️' },
  animaliimg:  { name: 'Che animale? 🐾',  emoji: '🐾' },
};

function tagQ(q, catId) {
  const cat = CAT_LABELS[catId] || { name:'Quiz 🎯', emoji:'🎯' };
  return { ...q, _cat:catId, subject:cat.name, emoji:cat.emoji, bg: CAT_BG[catId]||CAT_BG.default };
}
function pickN(pool, n, usedSet) {
  let avail = pool.map((q,i)=>({q,i})).filter(({i})=>!usedSet.has(i));
  if (avail.length < n) { usedSet.clear(); avail = pool.map((q,i)=>({q,i})); }
  const picked = shuffle(avail).slice(0,n);
  picked.forEach(({i})=>usedSet.add(i));
  return picked.map(({q})=>q);
}
function gu(room, cat) {
  if (!room.usedQuestions[cat]) room.usedQuestions[cat] = new Set();
  return room.usedQuestions[cat];
}

async function generateImageQuestion(usedNames=new Set()) {
  const cats=Object.keys(FAMOUS_ITALIANS);
  const cat=cats[Math.floor(Math.random()*cats.length)];
  for (const person of shuffle([...FAMOUS_ITALIANS[cat]])) {
    if (usedNames.has(person.name)) continue;
    const imgUrl=await getWikiImage(person.wiki);
    if (!imgUrl) continue;
    const allPeople=Object.values(FAMOUS_ITALIANS).flat();
    const wrong=allPeople.filter(p=>p.name!==person.name).sort(()=>Math.random()-.5).slice(0,3);
    const opts=[person,...wrong].sort(()=>Math.random()-.5);
    const ai=opts.findIndex(p=>p.name===person.name);
    return { type:'image', q:'Chi è questo personaggio famoso italiano?', imageUrl:`/imgproxy?url=${encodeURIComponent(imgUrl)}`, opts:opts.map(p=>p.name), a:ai };
  }
  return null;
}
async function generateArtworkQuestion(usedNames=new Set()) {
  const pool=FAMOUS_ARTWORKS.filter(a=>!usedNames.has(a.name));
  if (pool.length<4) return null;
  for (const art of shuffle([...pool])) {
    const imgUrl=await getWikiImage(art.wiki);
    if (!imgUrl) continue;
    const wrong=FAMOUS_ARTWORKS.filter(a=>a.name!==art.name).sort(()=>Math.random()-.5).slice(0,3);
    const opts=[art,...wrong].sort(()=>Math.random()-.5);
    const ai=opts.findIndex(a=>a.name===art.name);
    return { type:'image', q:"Di quale opera d'arte si tratta?", imageUrl:`/imgproxy?url=${encodeURIComponent(imgUrl)}`, opts:opts.map(a=>a.name), a:ai };
  }
  return null;
}
async function generateAnimalImageQuestion(usedNames=new Set()) {
  const pool=FAMOUS_ANIMALS.filter(a=>!usedNames.has(a.name));
  if (pool.length<4) return null;
  for (const animal of shuffle([...pool])) {
    const imgUrl=await getWikiImage(animal.wiki);
    if (!imgUrl) continue;
    const wrong=FAMOUS_ANIMALS.filter(a=>a.name!==animal.name).sort(()=>Math.random()-.5).slice(0,3);
    const opts=[animal,...wrong].sort(()=>Math.random()-.5);
    const ai=opts.findIndex(a=>a.name===animal.name);
    return { type:'image', q:'Che animale è questo?', imageUrl:`/imgproxy?url=${encodeURIComponent(imgUrl)}`, opts:opts.map(a=>a.name), a:ai };
  }
  return null;
}

async function generateMixedPool(room) {
  const questions=[];
  // Italia-centrico 65%
  pickN(QUESTIONS_ITALIA,      5, gu(room,'italia')).forEach(q=>questions.push(tagQ(q,'italia')));
  pickN(QUESTIONS_GASTRONOMIA, 3, gu(room,'gastronomia')).forEach(q=>questions.push(tagQ(q,'gastronomia')));
  pickN(QUESTIONS_MUSICA.filter(q=>!q.yt), 2, gu(room,'musica')).forEach(q=>questions.push(tagQ(q,'musica')));
  pickN(QUESTIONS_SPETTACOLO,  2, gu(room,'spettacolo')).forEach(q=>questions.push(tagQ(q,'spettacolo')));
  pickN(QUESTIONS_SPORT,       2, gu(room,'sport')).forEach(q=>questions.push(tagQ(q,'sport')));
  // Generico 35%
  const vfUsed=gu(room,'verofals');
  let vfAvail=VERO_FALSO.map((q,i)=>({q,i})).filter(({i})=>!vfUsed.has(i));
  if (vfAvail.length<2) { vfUsed.clear(); vfAvail=VERO_FALSO.map((q,i)=>({q,i})); }
  shuffle(vfAvail).slice(0,2).forEach(({q,i})=>{ vfUsed.add(i); questions.push(tagQ({type:'verofals',q:q.q,opts:['✅ Vero','❌ Falso'],a:q.a?0:1,explain:q.explain},'verofals')); });
  pickN(QUESTIONS_LOGICA,  1, gu(room,'logica')).forEach(q=>questions.push(tagQ(q,'logica')));
  pickN(QUESTIONS_ARTE,    1, gu(room,'arte')).forEach(q=>questions.push(tagQ(q,'arte')));
  pickN(QUESTIONS_ANIMALI, 1, gu(room,'animali')).forEach(q=>questions.push(tagQ(q,'animali')));
  // Immagini
  const imgUsed=new Set();
  const imgFns=[generateImageQuestion,generateArtworkQuestion,generateAnimalImageQuestion];
  const imgCats=['foto','opere','animaliimg'];
  const imgQs=[];
  for (let i=0;i<imgFns.length;i++) {
    const q=await imgFns[i](imgUsed).catch(()=>null);
    if (q) { imgUsed.add(q.opts[q.a]); imgQs.push(tagQ(q,imgCats[i])); }
  }
  // Mescola + intercala immagini ogni 5
  const textQs=shuffle(questions);
  const result=[];
  let imgIdx=0;
  for (let i=0;i<textQs.length;i++) {
    result.push(textQs[i]);
    if ((i+1)%5===0 && imgIdx<imgQs.length) result.push(imgQs[imgIdx++]);
  }
  while (imgIdx<imgQs.length) result.push(imgQs[imgIdx++]);
  const final=result.slice(0,20);
  // Domande doppio punteggio alle posizioni 6 e 13
  [6,13].forEach(idx=>{ if(final[idx]) final[idx].doublePoints=true; });
  return final;
}

const CHARACTERS = [
  { id:"sofia",  name:"Sofia",  role:"La Dolce",       color:"#a78bfa", gender:"f" },
  { id:"nova",   name:"Nova",   role:"La Cyber",       color:"#22d3ee", gender:"f" },
  { id:"quinn",  name:"Quinn",  role:"La Campionessa", color:"#f59e0b", gender:"f" },
  { id:"flora",  name:"Flora",  role:"La Natura",      color:"#4ade80", gender:"f" },
  { id:"rebel",  name:"Rebel",  role:"La Punk",        color:"#ef4444", gender:"f" },
  { id:"sage",   name:"Sage",   role:"La Studiosa",    color:"#92400e", gender:"f" },
  { id:"pixel",  name:"Pixel",  role:"La Gamer",       color:"#10b981", gender:"f" },
  { id:"jay",    name:"Jay",    role:"Lo Sportivo",    color:"#3b82f6", gender:"m" },
  { id:"leo",    name:"Leo",    role:"L'Avventuriero", color:"#f97316", gender:"m" },
  { id:"rico",   name:"Rico",   role:"Il Cool",        color:"#6366f1", gender:"m" },
  { id:"finn",   name:"Finn",   role:"Il Casual",      color:"#84cc16", gender:"m" },
  { id:"beat",   name:"Beat",   role:"Il DJ",          color:"#eab308", gender:"m" },
  { id:"mimo",   name:"Mimo",   role:"Il Simpatico",   color:"#06b6d4", gender:"m" },
  { id:"nerd",   name:"Nerd",   role:"Il Genio",       color:"#60a5fa", gender:"m" },
];

const rooms={}, socketRoom={};
function createRoom() {
  const code=generateCode();
  rooms[code]={ code, tvSocketId:null, players:{}, gameState:'lobby', currentSubject:'mix', currentQ:0, roundQuestions:[], timerInterval:null, timeLeft:15, roundNumber:0, maxRounds:1, correctAnswerCount:0, usedQuestions:{}, stats:{} };
  return rooms[code];
}
function getRoom(code) { return rooms[code]; }
function getRoomBySocket(sid) { const c=socketRoom[sid]; return c?rooms[c]:null; }
function getPlayersList(room) { return Object.values(room.players).map(p=>({ name:p.name, char:p.char, score:p.score, answered:p.answered, streak:p.streak||0 })); }
function emitToRoom(room,ev,data) { io.to(room.code).emit(ev,data); }

function startTimer(room) {
  room.timeLeft=15;
  clearInterval(room.timerInterval);
  room.timerInterval=setInterval(()=>{
    room.timeLeft--;
    emitToRoom(room,'timer',{ timeLeft:room.timeLeft });
    if(room.timeLeft<=0) { clearInterval(room.timerInterval); revealAnswer(room); }
  },1000);
}

function revealAnswer(room) {
  clearInterval(room.timerInterval);
  room.gameState='reveal';
  const q=room.roundQuestions[room.currentQ];
  emitToRoom(room,'reveal',{ correctIndex:q.a, correctAnswer:q.opts[q.a], explain:q.explain||null, players:getPlayersList(room) });
  setTimeout(()=>{
    room.currentQ++;
    const total=room.roundQuestions.length;
    // Mini-podio ogni 5 domande
    if (room.currentQ%5===0 && room.currentQ<total) {
      const sorted=getPlayersList(room).sort((a,b)=>b.score-a.score);
      emitToRoom(room,'mini-podio',{ players:sorted, qDone:room.currentQ, total });
      setTimeout(()=>sendQuestion(room),3500);
    } else if (room.currentQ>=total) {
      endRound(room);
    } else {
      sendQuestion(room);
    }
  },3000);
}

function sendQuestion(room) {
  if(!room.roundQuestions||room.roundQuestions.length===0) return;
  room.gameState='question';
  Object.values(room.players).forEach(p=>p.answered=false);
  room.correctAnswerCount=0;
  const q=room.roundQuestions[room.currentQ];
  emitToRoom(room,'question',{
    index:room.currentQ, total:room.roundQuestions.length,
    subject:q.subject||'Cultura Generale', emoji:q.emoji||'🎯', bg:q.bg||CAT_BG.default,
    q:q.q, yt:q.yt||null, opts:q.opts, imageUrl:q.imageUrl||null,
    type:q.type||'normal', explain:q.explain||null, doublePoints:q.doublePoints||false,
    players:getPlayersList(room),
  });
  startTimer(room);
}

function endRound(room) {
  room.gameState='round-end';
  room.roundNumber++;
  const sorted=getPlayersList(room).sort((a,b)=>b.score-a.score);
  const stats=room.stats||{};
  const statsList=Object.values(room.players).map(p=>({
    name:p.name, char:p.char,
    correct:stats[p.name]?.correct||0,
    fastest:stats[p.name]?.fastest||0,
    maxStreak:stats[p.name]?.maxStreak||0,
  }));
  emitToRoom(room,'round-end',{ players:sorted, roundNumber:room.roundNumber, maxRounds:1, isLastRound:true, stats:statsList });
}

function normalize(str) { return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,'').trim(); }
function fuzzyMatch(input,correct) {
  const a=normalize(input),b=normalize(correct);
  if(a===b) return true;
  if(b.includes(a)&&a.length>=3) return true;
  if(a.includes(b)&&b.length>=3) return true;
  const maxDist=Math.floor(b.length*0.3);
  return levenshtein(a,b)<=maxDist;
}
function levenshtein(a,b) {
  const m=a.length,n=b.length;
  const dp=Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(_,j)=>i===0?j:j===0?i:0));
  for(let i=1;i<=m;i++) for(let j=1;j<=n;j++) dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[m][n];
}

setInterval(()=>{ Object.keys(rooms).forEach(code=>{ const r=rooms[code]; if(Object.keys(r.players).length===0&&!r.tvSocketId) delete rooms[code]; }); },1000*60*30);

app.get('/qr',async(req,res)=>{
  const host=req.headers.host,proto=req.headers['x-forwarded-proto']||'http';
  try { const qr=await QRCode.toDataURL(`${proto}://${host}/phone`,{width:180,margin:1}); res.json({qr}); }
  catch(e){ res.status(500).json({error:e.message}); }
});

io.on('connection',(socket)=>{
  console.log('Connesso:',socket.id);

  socket.on('register-tv',()=>{
    const room=createRoom();
    room.tvSocketId=socket.id;
    socketRoom[socket.id]=room.code;
    socket.join(room.code);
    socket.emit('room-info',{ code:room.code, players:[] });
    console.log('TV stanza:',room.code);
  });

  socket.on('join',({code,name,charId})=>{
    const room=getRoom(code);
    if(!room){ socket.emit('join-error',{msg:'Codice non valido!'}); return; }
    if(room.gameState!=='lobby'){ socket.emit('join-error',{msg:'La partita è già iniziata!'}); return; }
    if(Object.values(room.players).some(p=>p.char.id===charId)){ socket.emit('join-error',{msg:'Personaggio già scelto!'}); return; }
    const char=CHARACTERS.find(c=>c.id===charId);
    room.players[socket.id]={ socketId:socket.id, name, char, score:0, answered:false, streak:0 };
    socketRoom[socket.id]=code;
    socket.join(code);
    socket.emit('joined',{name,char});
    emitToRoom(room,'players-update',{ players:getPlayersList(room) });
  });

  socket.on('start-game',()=>{
    const room=getRoomBySocket(socket.id);
    if(!room||Object.keys(room.players).length<1) return;
    room.maxRounds=1; room.gameState='loading'; room.roundNumber=0; room.stats={};
    Object.values(room.players).forEach(p=>{ p.score=0; p.streak=0; });
    emitToRoom(room,'game-starting',{ emoji:'🎯', title:'Cultura Generale Italiana' });
    generateMixedPool(room).then(questions=>{
      room.roundQuestions=questions; room.currentQ=0; room.currentSubject='mix'; room.gameState='question-pending';
      setTimeout(()=>sendQuestion(room),2500);
    }).catch(err=>{
      console.error('Errore pool:',err);
      const fallback=shuffle(QUESTIONS_ITALIA).slice(0,20).map(q=>tagQ(q,'italia'));
      [6,13].forEach(idx=>{ if(fallback[idx]) fallback[idx].doublePoints=true; });
      room.roundQuestions=fallback; room.currentQ=0; room.currentSubject='mix'; room.gameState='question-pending';
      setTimeout(()=>sendQuestion(room),2500);
    });
  });

  // Jolly 50/50
  socket.on('joker-5050',()=>{
    const room=getRoomBySocket(socket.id);
    if(!room||room.gameState!=='question') return;
    const q=room.roundQuestions[room.currentQ]; if(!q) return;
    const wrong=[0,1,2,3].filter(i=>i!==q.a).sort(()=>Math.random()-.5).slice(0,2);
    socket.emit('joker-5050-result',{ removeIndices:wrong });
  });

  // Jolly Congela Timer (5 secondi di pausa)
  socket.on('joker-freeze',()=>{
    const room=getRoomBySocket(socket.id);
    if(!room||room.gameState!=='question') return;
    const playerName=room.players[socket.id]?.name||'';
    clearInterval(room.timerInterval);
    emitToRoom(room,'timer-frozen',{ timeLeft:room.timeLeft, by:playerName });
    setTimeout(()=>{
      if(room.gameState!=='question') return;
      room.timerInterval=setInterval(()=>{
        room.timeLeft--;
        emitToRoom(room,'timer',{ timeLeft:room.timeLeft });
        if(room.timeLeft<=0){ clearInterval(room.timerInterval); revealAnswer(room); }
      },1000);
      emitToRoom(room,'timer-resumed',{});
    },5000);
  });

  // Jolly Spia Risposta
  socket.on('joker-spy',()=>{
    const room=getRoomBySocket(socket.id);
    if(!room||room.gameState!=='question') return;
    const q=room.roundQuestions[room.currentQ]; if(!q) return;
    socket.emit('joker-spy-result',{ correctIndex:q.a });
  });

  socket.on('end-game',()=>{
    const room=getRoomBySocket(socket.id); if(!room) return;
    room.gameState='podium';
    emitToRoom(room,'podium',{ players:getPlayersList(room).sort((a,b)=>b.score-a.score) });
  });

  socket.on('answer',({index,answerIndex})=>{
    const room=getRoomBySocket(socket.id); if(!room) return;
    if(room.gameState!=='question'&&room.gameState!=='question-pending') return;
    if(index!==room.currentQ) return;
    const player=room.players[socket.id];
    if(!player||player.answered) return;
    player.answered=true;
    const q=room.roundQuestions[room.currentQ];
    const correct=answerIndex===q.a;
    let pts=0,bonus=0,streakBonus=0;
    if(correct){
      pts=Math.max(1,room.timeLeft);
      if(q.doublePoints) pts*=2;
      if(room.correctAnswerCount===0) bonus=5;
      else if(room.correctAnswerCount===1) bonus=3;
      else if(room.correctAnswerCount===2) bonus=1;
      room.correctAnswerCount++;
      player.streak=(player.streak||0)+1;
      if(player.streak===3) streakBonus=5;
      else if(player.streak===5) streakBonus=8;
      else if(player.streak>=7) streakBonus=10;
      pts+=bonus+streakBonus;
      if(!room.stats[player.name]) room.stats[player.name]={correct:0,fastest:0,maxStreak:0};
      room.stats[player.name].correct++;
      if(room.correctAnswerCount===1) room.stats[player.name].fastest++;
      room.stats[player.name].maxStreak=Math.max(room.stats[player.name].maxStreak,player.streak);
    } else { player.streak=0; }
    player.score+=pts;
    socket.emit('answer-result',{ correct,pts,bonus,streakBonus,score:player.score,streak:player.streak,doublePoints:q.doublePoints||false });
    emitToRoom(room,'player-answered',{ name:player.name,correct,players:getPlayersList(room),streak:player.streak });
    if(Object.values(room.players).every(p=>p.answered)){ clearInterval(room.timerInterval); revealAnswer(room); }
  });

  socket.on('answer-text',({index,text})=>{
    const room=getRoomBySocket(socket.id); if(!room) return;
    if(room.gameState!=='question'&&room.gameState!=='question-pending') return;
    if(index!==room.currentQ) return;
    const player=room.players[socket.id];
    if(!player||player.answered) return;
    player.answered=true;
    const q=room.roundQuestions[room.currentQ];
    const correct=fuzzyMatch(text,q.opts[q.a]);
    let pts=0,bonus=0,streakBonus=0;
    if(correct){
      pts=Math.max(1,room.timeLeft);
      if(q.doublePoints) pts*=2;
      if(room.correctAnswerCount===0) bonus=5;
      else if(room.correctAnswerCount===1) bonus=3;
      else if(room.correctAnswerCount===2) bonus=1;
      room.correctAnswerCount++;
      player.streak=(player.streak||0)+1;
      if(player.streak===3) streakBonus=5;
      else if(player.streak===5) streakBonus=8;
      else if(player.streak>=7) streakBonus=10;
      pts+=bonus+streakBonus;
      if(!room.stats[player.name]) room.stats[player.name]={correct:0,fastest:0,maxStreak:0};
      room.stats[player.name].correct++;
      if(room.correctAnswerCount===1) room.stats[player.name].fastest++;
      room.stats[player.name].maxStreak=Math.max(room.stats[player.name].maxStreak,player.streak);
    } else { player.streak=0; }
    player.score+=pts;
    socket.emit('answer-result',{ correct,pts,bonus,streakBonus,score:player.score,streak:player.streak,correctAnswer:q.opts[q.a] });
    emitToRoom(room,'player-answered',{ name:player.name,correct,players:getPlayersList(room),streak:player.streak });
    if(Object.values(room.players).every(p=>p.answered)){ clearInterval(room.timerInterval); revealAnswer(room); }
  });

  socket.on('reset-game',()=>{
    const room=getRoomBySocket(socket.id); if(!room) return;
    Object.keys(room.players).forEach(sid=>delete socketRoom[sid]);
    room.players={}; room.gameState='lobby'; room.currentQ=0; room.currentSubject='mix';
    room.roundNumber=0; room.maxRounds=1; room.correctAnswerCount=0; room.usedQuestions={}; room.stats={};
    clearInterval(room.timerInterval);
    const oldCode=room.code,newCode=generateCode();
    room.code=newCode; rooms[newCode]=room; delete rooms[oldCode];
    socketRoom[socket.id]=newCode; socket.leave(oldCode); socket.join(newCode);
    emitToRoom(room,'reset',{ code:newCode });
  });

  socket.on('disconnect',()=>{
    const room=getRoomBySocket(socket.id);
    if(room){
      if(room.players[socket.id]){ const name=room.players[socket.id].name; delete room.players[socket.id]; emitToRoom(room,'players-update',{ players:getPlayersList(room) }); console.log(name,'disconnesso'); }
      if(room.tvSocketId===socket.id) room.tvSocketId=null;
    }
    delete socketRoom[socket.id];
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,'0.0.0.0',()=>{ console.log(`\n🎮 Quiz Game porta ${PORT}\n`); });
