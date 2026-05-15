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
  // Italia
  { q: "La muraglia cinese è visibile dallo spazio a occhio nudo.", a: false, explain: "È un mito! È troppo stretta per essere vista dallo spazio." },
  { q: "L'Italia ha vinto 4 Mondiali di calcio.", a: true, explain: "1934, 1938, 1982 e 2006." },
  { q: "Il cuore di un polpo batte 3 volte.", a: true, explain: "Ha 3 cuori: uno principale e due branchiali." },
  { q: "Napoleone era alto meno di 1,60 m.", a: false, explain: "Era alto circa 1,69 m, nella media per l'epoca." },
  { q: "Il Monte Bianco è la montagna più alta d'Europa.", a: true, explain: "Con i suoi 4.808 m è la più alta d'Europa occidentale." },
  { q: "L'oro affonda nell'acqua.", a: true, explain: "L'oro è molto denso, circa 19 volte più dell'acqua." },
  { q: "Il Vaticano è il paese più piccolo del mondo.", a: true, explain: "Con soli 0,44 km² è lo stato più piccolo al mondo." },
  { q: "Il sangue delle aragoste è rosso.", a: false, explain: "Il sangue delle aragoste è blu, per il rame al posto del ferro." },
  { q: "L'Italia ha più siti UNESCO di qualsiasi altro paese.", a: true, explain: "L'Italia è il paese con più siti UNESCO al mondo." },
  { q: "Gli elefanti sono i soli mammiferi che non possono saltare.", a: true, explain: "Il loro peso non lo consente." },
  { q: "La torre di Pisa è inclinata verso est.", a: false, explain: "È inclinata verso sud." },
  { q: "La pizza Margherita prende il nome da Margherita di Savoia.", a: true, explain: "Fu creata nel 1889 in onore della regina." },
  { q: "Dante Alighieri è nato a Firenze.", a: true, explain: "Dante nacque a Firenze intorno al 1265." },
  { q: "La Gioconda è dipinta su tela.", a: false, explain: "È dipinta su tavola di legno di pioppo." },
  { q: "Il Vesuvio è ancora un vulcano attivo.", a: true, explain: "Il Vesuvio è considerato uno dei vulcani più pericolosi al mondo." },
  { q: "Leonardo da Vinci era mancino.", a: true, explain: "Leonardo scriveva con la mano sinistra da destra a sinistra." },
  { q: "Il gelato è stato inventato in Italia.", a: true, explain: "Il gelato moderno ha origini fiorentine del XVI secolo." },
  { q: "Venezia è costruita su 118 isole.", a: true, explain: "Venezia è composta da 118 isolette collegate da ponti." },
  { q: "L'alfabeto italiano ha 21 lettere.", a: true, explain: "L'alfabeto italiano ha 21 lettere: mancano J, K, W, X, Y." },
  { q: "La pizza napoletana è patrimonio UNESCO.", a: true, explain: "La pizza napoletana è patrimonio immateriale UNESCO dal 2017." },
  { q: "L'Etna è il vulcano più alto d'Europa.", a: true, explain: "Con i suoi 3.357 m è il più alto vulcano attivo d'Europa." },
  { q: "Galileo Galilei è nato a Pisa.", a: true, explain: "Galileo nacque a Pisa nel 1564." },
  { q: "I galli non depongono uova.", a: true, explain: "Le uova le depongono le galline, non i galli!" },
  { q: "Un pesce rosso ha una memoria di soli 3 secondi.", a: false, explain: "I pesci rossi possono ricordare eventi per mesi." },
  { q: "Mercurio è il pianeta più caldo del sistema solare.", a: false, explain: "Venere è più caldo grazie all'effetto serra." },
  { q: "L'acqua può bollire a meno di 100°C.", a: true, explain: "Ad alta quota la pressione è minore e l'acqua bolle prima." },
  { q: "La Ferrari è stata fondata a Maranello.", a: true, explain: "Enzo Ferrari fondò la Ferrari a Maranello nel 1947." },
  { q: "Il Po è il fiume più lungo d'Italia.", a: true, explain: "Il Po misura 652 km." },
  { q: "Roma ha più fontane di qualsiasi altra città al mondo.", a: true, explain: "Roma ha oltre 2.000 fontane storiche." },
  { q: "La Sardegna è più grande della Sicilia.", a: false, explain: "La Sicilia è più grande con 25.711 km² contro i 24.090 km² della Sardegna." },
  { q: "Il Duomo di Milano ha più di 3.000 statue.", a: true, explain: "Ha circa 3.400 statue esterne e 700 interne." },
  { q: "L'italiano deriva direttamente dal latino.", a: true, explain: "L'italiano è una lingua romanza discendente dal latino volgare." },
  { q: "Michelangelo dipinse la Cappella Sistina in piedi.", a: false, explain: "Dipinse sdraiato su un'impalcatura, con il collo piegato." },
  { q: "Il caffè espresso è originario dell'Italia.", a: true, explain: "L'espresso fu inventato a Torino nel 1884." },
  { q: "La Basilica di San Pietro è la chiesa più grande del mondo.", a: true, explain: "Con 15.160 m² è la più grande chiesa del mondo." },
  { q: "Il Chianti è un vino prodotto in Toscana.", a: true, explain: "Il Chianti è prodotto nella zona tra Firenze e Siena." },
  { q: "Il Pantheon di Roma ha quasi 2000 anni.", a: true, explain: "Fu costruito tra il 118 e il 125 d.C." },
  { q: "L'italiano è una delle lingue ufficiali della Svizzera.", a: true, explain: "L'italiano è una delle 4 lingue ufficiali svizzere." },
  { q: "La pasta è stata inventata in Cina.", a: false, explain: "Le origini della pasta sono italiane, anche se ci sono teorie sul legame con la Cina." },
  { q: "Il Colosseo fu costruito in circa 10 anni.", a: true, explain: "La costruzione durò dal 70 all'80 d.C." },
  // Scienza & Natura
  { q: "Il DNA umano condivide circa il 98% con quello degli scimpanzé.", a: true, explain: "Siamo i parenti più stretti degli scimpanzé." },
  { q: "Il Sole è una stella di tipo nana gialla.", a: true, explain: "Il Sole è classificato come nana gialla di tipo G." },
  { q: "Gli esseri umani usano solo il 10% del cervello.", a: false, explain: "Usiamo praticamente tutte le aree del cervello, solo non tutte contemporaneamente." },
  { q: "La luce del sole impiega circa 8 minuti per raggiungere la Terra.", a: true, explain: "Esattamente circa 8 minuti e 20 secondi." },
  { q: "Il cuore umano batte circa 100.000 volte al giorno.", a: true, explain: "In media circa 100.000 battiti nelle 24 ore." },
  { q: "I diamanti sono la sostanza naturale più dura.", a: true, explain: "Il diamante è il materiale naturale con la durezza più alta (10 sulla scala di Mohs)." },
  { q: "L'acqua pura è un buon conduttore di elettricità.", a: false, explain: "L'acqua pura è un cattivo conduttore; sono i minerali disciolti che la rendono conduttiva." },
  { q: "Il suono viaggia più veloce della luce.", a: false, explain: "La luce viaggia circa 880.000 volte più veloce del suono." },
  { q: "I pipistrelli sono ciechi.", a: false, explain: "I pipistrelli vedono benissimo, e usano anche l'ecolocalizzazione." },
  { q: "Plutone è ancora classificato come pianeta.", a: false, explain: "Dal 2006 Plutone è classificato come pianeta nano." },
  { q: "Il corpo umano ha più batteri che cellule.", a: true, explain: "Si stima che i batteri nel corpo siano in rapporto circa 1:1 con le cellule umane." },
  { q: "La Luna si allontana dalla Terra ogni anno.", a: true, explain: "La Luna si allontana di circa 3,8 cm all'anno." },
  { q: "Gli squali sono più antichi degli alberi.", a: true, explain: "Gli squali esistono da circa 450 milioni di anni, gli alberi da circa 350 milioni." },
  { q: "Il ferro è l'elemento più abbondante sulla Terra.", a: true, explain: "Il ferro costituisce circa il 32% della massa totale della Terra." },
  { q: "Gli occhi di un adulto sono delle stesse dimensioni dalla nascita.", a: false, explain: "Gli occhi crescono durante l'infanzia, ma le orecchie sì che non smettono mai di crescere." },
  { q: "La Torre Eiffel è più alta d'estate che d'inverno.", a: true, explain: "Il calore dilata il ferro: la torre può essere 15 cm più alta in estate." },
  { q: "Il miele non scade mai.", a: true, explain: "Il miele può durare migliaia di anni grazie alla sua composizione chimica." },
  { q: "Il polpo ha tre cuori.", a: true, explain: "Due cuori branchiali e uno sistemico." },
  { q: "Gli aironi volano con il collo piegato.", a: true, explain: "A differenza delle cicogne che lo tengono dritto." },
  { q: "Un fulmine è più caldo della superficie del Sole.", a: true, explain: "Un fulmine raggiunge circa 30.000 K, contro i 5.778 K della superficie solare." },
  // Curiosità varie
  { q: "La Francia è il paese più visitato al mondo.", a: true, explain: "La Francia accoglie circa 90 milioni di turisti all'anno." },
  { q: "Il pesce rosso ha una memoria di tre secondi.", a: false, explain: "È un mito: possono ricordare cose per mesi." },
  { q: "Il cuore di una balena può essere grande quanto un'auto.", a: true, explain: "Il cuore della balena blu può pesare circa 180 kg." },
  { q: "Le impronte digitali dei koala sono quasi identiche a quelle umane.", a: true, explain: "Così simili da essere confuse anche dai criminologi." },
  { q: "Il cioccolato fondente fa bene al cuore.", a: true, explain: "Con moderazione: i flavonoidi del cacao hanno effetti cardioprotettivi." },
  { q: "Gli aerei commerciali volano più veloce del suono.", a: false, explain: "Solo i Concorde lo facevano; gli aerei commerciali normali no." },
  { q: "Il Sahara è stato verde migliaia di anni fa.", a: true, explain: "Circa 6.000 anni fa il Sahara era verde e ospitava laghi e animali." },
  { q: "Esistono più stelle nell'universo che granelli di sabbia sulla Terra.", a: true, explain: "Si stima ci siano circa 10 volte più stelle che granelli di sabbia su tutte le spiagge terrestri." },
  { q: "Il pianoforte fu inventato in Italia.", a: true, explain: "Fu inventato da Bartolomeo Cristofori a Firenze attorno al 1700." },
  { q: "Gli ottopodi hanno 8 tentacoli.", a: true, explain: "Il nome 'polpo' deriva dal greco 'otto piedi'." },
  { q: "Il vetro è un liquido molto lento.", a: false, explain: "È un solido amorfo, non un liquido; le vecchie finestre più spesse in basso sono dovute ai metodi di produzione." },
  { q: "La lingua è il muscolo più forte del corpo umano.", a: false, explain: "Il muscolo più forte in proporzione è il massetere (mascella)." },
  { q: "Gli elefanti sono i soli animali oltre agli umani a riconoscersi allo specchio.", a: false, explain: "Anche delfini, scimpanzé, gorilla e gazze si riconoscono allo specchio." },
  { q: "Il neon è un gas inerte e non reagisce con nulla.", a: true, explain: "Il neon è un gas nobile praticamente inerte." },
  { q: "Il pinguino è l'unico uccello che cammina in posizione eretta come gli umani.", a: false, explain: "Anche altri uccelli camminano in posizione eretta, come i pappagalli." },
  { q: "Le tigri hanno la pelle a strisce, non solo il pelo.", a: true, explain: "Le strisce sono presenti anche nella pelle sotto il pelo." },
  { q: "Un caracol (lumaca) può dormire per 3 anni.", a: true, explain: "Le lumache vanno in letargo quando il clima è sfavorevole, potendo dormire anche anni." },
  { q: "L'occhio di un cavallo è più grande del suo cervello.", a: true, explain: "I cavalli hanno occhi molto grandi rispetto alla testa." },
  { q: "Il suono non può viaggiare nel vuoto.", a: true, explain: "Il suono ha bisogno di un mezzo (aria, acqua, solido) per propagarsi." },
  { q: "La Gran Bretagna e il Regno Unito sono la stessa cosa.", a: false, explain: "La Gran Bretagna è l'isola principale; il Regno Unito include anche l'Irlanda del Nord." },
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
  {q:"Qual è la regione italiana con più abitanti?",opts:["Sicilia","Lazio","Campania","Lombardia"],a:3},
  {q:"In quale regione si trova il Gran Sasso?",opts:["Lazio","Umbria","Abruzzo","Marche"],a:2},
  {q:"Chi ha dipinto la Cappella Sistina?",opts:["Leonardo da Vinci","Raffaello","Michelangelo","Botticelli"],a:2},
  {q:"Qual è il simbolo della città di Roma?",opts:["Il Toro","La Lupa","Il Leone","L'Aquila"],a:1},
  {q:"In quale anno fu costruito il Colosseo?",opts:["70-80 d.C.","100-110 d.C.","50-60 d.C.","120-130 d.C."],a:0},
  {q:"Qual è la valuta italiana prima dell'Euro?",opts:["Marco","Franco","Corona","Lira"],a:3},
  {q:"In quale regione si trova Assisi?",opts:["Toscana","Marche","Umbria","Lazio"],a:2},
  {q:"Chi è il patrono d'Italia?",opts:["San Pietro","San Paolo","San Francesco","San Giorgio"],a:2},
  {q:"Qual è il porto più grande d'Italia?",opts:["Napoli","Genova","Venezia","Trieste"],a:1},
  {q:"Quale città italiana è famosa per il balsamico?",opts:["Parma","Reggio Emilia","Modena","Bologna"],a:2},
  {q:"In quale anno Roma è diventata capitale d'Italia?",opts:["1861","1865","1870","1876"],a:2},
  {q:"Chi ha composto 'La Traviata'?",opts:["Puccini","Rossini","Donizetti","Verdi"],a:3},
  {q:"Quale città italiana ospita il Palio?",opts:["Firenze","Pisa","Siena","Arezzo"],a:2},
  {q:"In quale anno fu costruita la Torre di Pisa?",opts:["1063","1173","1350","1420"],a:1},
  {q:"Chi ha composto 'La Bohème'?",opts:["Verdi","Rossini","Donizetti","Puccini"],a:3},
  {q:"In quale regione si trova Amalfi?",opts:["Lazio","Calabria","Campania","Puglia"],a:2},
  {q:"Qual è il lago tra Italia e Svizzera?",opts:["Lago di Garda","Lago Maggiore","Lago di Como","Lago di Lugano"],a:3},
  {q:"Chi ha inventato il telefono secondo gli italiani?",opts:["Marconi","Meucci","Volta","Fermi"],a:1},
  {q:"Quale pilota italiano di F1 ha vinto più titoli mondiali?",opts:["Ascari","Lauda","Villeneuve","Nannini"],a:0},
  {q:"Qual è la regione italiana che confina con Austria e Slovenia?",opts:["Veneto","Friuli-Venezia Giulia","Trentino-Alto Adige","Entrambe B e C"],a:3},
  {q:"Quale pittore italiano è famoso per la Gioconda?",opts:["Michelangelo","Raffaello","Leonardo da Vinci","Tiziano"],a:2},
  {q:"In quale città si trova il Museo degli Uffizi?",opts:["Roma","Venezia","Firenze","Milano"],a:2},
  {q:"Chi ha scritto 'Cuore' di De Amicis?",opts:["Collodi","De Amicis","Verga","Carducci"],a:1},
  {q:"Qual è il formaggio italiano più consumato al mondo?",opts:["Parmigiano","Grana Padano","Mozzarella","Pecorino"],a:2},
  {q:"In quale città si trova il Teatro San Carlo?",opts:["Roma","Milano","Venezia","Napoli"],a:3},
  {q:"Quale corridore italiano ha vinto il Giro d'Italia più volte?",opts:["Coppi","Bartali","Moser","Pantani"],a:0},
  {q:"In quale regione si trova Matera, città dei Sassi?",opts:["Puglia","Calabria","Basilicata","Campania"],a:2},
  {q:"Qual è la penisola italiana nota per la produzione di olio?",opts:["Penisola Sorrentina","Penisola Salentina","Penisola di Sorrento","Penisola del Gargano"],a:1},
  {q:"Chi ha composto 'O Sole Mio'?",opts:["Verdi","Puccini","Di Capua","Donizetti"],a:2},
  {q:"In quale regione si trovano le Cinque Terre?",opts:["Toscana","Liguria","Piemonte","Lombardia"],a:1},
  {q:"Quale città italiana è famosa per la ceramica di Faenza?",opts:["Pesaro","Faenza","Urbino","Rimini"],a:1},
  {q:"In quale città si trova il Palazzo Ducale di Venezia?",opts:["Venezia","Mantova","Urbino","Ferrara"],a:0},
  {q:"Qual è la specialità culinaria di Venezia?",opts:["Pizza","Risotto","Sarde in saor","Ribollita"],a:2},
  {q:"Quante province ha l'Italia?",opts:["97","103","107","110"],a:3},
  {q:"Quale regione italiana produce la 'ndrangheta?",opts:["Sicilia","Campania","Calabria","Puglia"],a:2},
  {q:"Qual è la lunghezza della penisola italiana?",opts:["900 km","1100 km","1300 km","1500 km"],a:2},
  {q:"In quale città si trova il Quirinale?",opts:["Milano","Firenze","Roma","Torino"],a:2},
  {q:"Chi è l'attuale Presidente della Repubblica Italiana (2024)?",opts:["Draghi","Conte","Mattarella","Meloni"],a:2},
  {q:"In quale anno fu fondata la Repubblica Italiana?",opts:["1944","1946","1948","1950"],a:1},
  {q:"Qual è la regione italiana con più turisti stranieri?",opts:["Sicilia","Toscana","Veneto","Lazio"],a:2},
  {q:"In quale regione si trova San Gimignano?",opts:["Umbria","Marche","Toscana","Lazio"],a:2},
  {q:"Chi ha fondato Roma secondo la leggenda?",opts:["Enea","Romolo","Remo","Numa"],a:1},
  {q:"Quale scultore italiano è famoso per la 'Pietà'?",opts:["Donatello","Bernini","Canova","Michelangelo"],a:3},
  {q:"In quale città si trova il Palazzo Reale di Caserta?",opts:["Roma","Napoli","Caserta","Salerno"],a:2},
  {q:"Qual è la montagna più alta delle Dolomiti?",opts:["Monte Marmolada","Monte Civetta","Tre Cime di Lavaredo","Monte Pelmo"],a:0},
  {q:"In quale regione si trovano i Sassi di Matera?",opts:["Puglia","Calabria","Basilicata","Campania"],a:2},
  {q:"Quale città italiana è la capitale della moda?",opts:["Roma","Venezia","Milano","Firenze"],a:2},
  {q:"Chi ha inventato il violino moderno?",opts:["Amati","Stradivari","Guarneri","Entrambi Amati e Stradivari"],a:0},
  {q:"In quale città si trova la Fontana dei Quattro Fiumi del Bernini?",opts:["Firenze","Venezia","Roma","Napoli"],a:2},
  {q:"Quale scrittore italiano ha vinto il Nobel per la Letteratura nel 1975?",opts:["Calvino","Moravia","Montale","Eco"],a:2},
  {q:"In quale anno l'Italia ha vinto gli Europei di calcio del 2020?",opts:["2019","2020","2021","2022"],a:2},
  {q:"Quale è la regione più piccola d'Italia?",opts:["Molise","Valle d'Aosta","Basilicata","Umbria"],a:1},
  {q:"In quale città si trova la Cappella degli Scrovegni affrescata da Giotto?",opts:["Firenze","Padova","Venezia","Verona"],a:1},
  {q:"Qual è il mare a ovest della Sardegna?",opts:["Mar Tirreno","Mar Ligure","Mar di Sardegna","Mar Mediterraneo"],a:2},
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
  {q:"Cosa si intende per 'umami'?",opts:["Dolce","Acido","Sapido/savorito","Amaro"],a:2},
  {q:"Quale condimento è base della cucina toscana?",opts:["Burro","Olio extravergine d'oliva","Strutto","Lardo"],a:1},
  {q:"Qual è l'ingrediente base del tahin?",opts:["Mandorle","Arachidi","Sesamo","Pinoli"],a:2},
  {q:"Da quale paese proviene il pad thai?",opts:["Vietnam","Cambogia","Tailandia","Myanmar"],a:2},
  {q:"Cosa si intende per 'julienne'?",opts:["Tagliare a dadini","Tagliare a fiammifero","Tritare finemente","Grattugiare"],a:1},
  {q:"Quale è il pesce usato nel sashimi giapponese?",opts:["Solo tonno","Solo salmone","Vari pesci crudi","Solo branzino"],a:2},
  {q:"Da dove proviene il baklava?",opts:["Grecia","Turchia","Origini medio-orientali condivise","Libano"],a:2},
  {q:"Cos'è il foie gras?",opts:["Fegato grasso d'oca o anatra","Formaggio francese","Pesce marinato","Tartufo"],a:0},
  {q:"Quale spezia dà il colore giallo al curry?",opts:["Curcuma","Zafferano","Paprika","Cardamomo"],a:0},
  {q:"Cosa sono i dim sum?",opts:["Piatti vietnamiti","Bocconcini cinesi da tè","Dumplings giapponesi","Fritture coreane"],a:1},
  {q:"Da quale paese proviene la moussaka?",opts:["Turchia","Libano","Grecia","Bulgaria"],a:2},
  {q:"Cosa sono i bao?",opts:["Riso al vapore","Panini al vapore cinesi","Noodles","Dumplings fritti"],a:1},
  {q:"Come si chiama il pane piatto indiano lievitato?",opts:["Chapati","Naan","Roti","Paratha"],a:1},
  {q:"Quale è la specialità di Venezia tra queste?",opts:["Pizza","Risotto al nero di seppia","Sarde in saor","Baccalà mantecato"],a:2},
  {q:"Da dove proviene il wasabi?",opts:["Cina","Corea","Giappone","Vietnam"],a:2},
  {q:"Cos'è il kefir?",opts:["Formaggio greco","Latte fermentato","Panna acida","Yogurt greco"],a:1},
  {q:"Quale è la base del gazpacho spagnolo?",opts:["Cetrioli","Pomodori","Peperoni","Cipolla"],a:1},
  {q:"Cos'è il miso?",opts:["Pasta di soia fermentata","Alga marina","Tofu fritto","Salsa di soia"],a:0},
  {q:"Come si chiama il pane tradizionale etiope?",opts:["Naan","Pita","Injera","Chapati"],a:2},
  {q:"Quale è il dolce tipico del Tirolo?",opts:["Strudel","Sachertorte","Palatschinken","Kaiserschmarrn"],a:0},
  {q:"Da dove proviene la salsa Worcestershire?",opts:["USA","Francia","Inghilterra","India"],a:2},
  {q:"Cos'è il prosciutto iberico?",opts:["Prosciutto portoghese","Jamón da maiali iberici","Pancetta spagnola affumicata","Bacon stagionato"],a:1},
  {q:"Quale è il piatto nazionale del Giappone?",opts:["Sushi","Ramen","Sukiyaki","Non ne ha uno ufficiale"],a:3},
  {q:"Cos'è il Cointreau?",opts:["Vino francese","Liquore all'arancia","Birra belga","Aperitivo italiano"],a:1},
  {q:"Da quale frutto si fa il Calvados?",opts:["Pera","Prugna","Mela","Ciliegia"],a:2},
  {q:"Quale è l'ingrediente segreto del tiramisù originale?",opts:["Mascarpone","Savoiardi","Marsala","Caffè"],a:0},
  {q:"Cosa sono i pierogi?",opts:["Pasta ripiena polacca","Gnocchi russi","Ravioli ucraini","Crocchette ceche"],a:0},
  {q:"Da dove proviene il hummus?",opts:["Origini mediorientali condivise","Solo Israele","Solo Libano","Egitto"],a:0},
  {q:"Qual è la differenza tra prosciutto crudo e cotto?",opts:["Solo il colore","Uno è stagionato, l'altro cotto","Vengono da animali diversi","Non c'è differenza"],a:1},
  {q:"Cosa sono i gyoza?",opts:["Ramen giapponesi","Ravioli giapponesi fritti","Zuppa di miso","Tofu fritto"],a:1},
  {q:"Da quale paese proviene il falafel?",opts:["Origini mediorientali condivise","Solo Egitto","Solo Israele","Solo Libano"],a:0},
  {q:"Cos'è la bottarga?",opts:["Pasta di pesce","Uova di muggine o tonno essiccate","Tartufo di mare","Alga essiccata"],a:1},
  {q:"Da dove proviene la fondue?",opts:["Francia","Austria","Svizzera","Italia"],a:2},
  {q:"Quale è l'ingrediente principale del guacamole oltre all'avocado?",opts:["Cipolla e lime","Solo lime","Solo sale","Peperoncino e aglio"],a:0},
  {q:"Cos'è il Prosciutto di San Daniele?",opts:["Prosciutto toscano","Prosciutto friulano","Prosciutto sardo","Prosciutto veneto"],a:1},
  {q:"Da quale paese proviene il cheddar?",opts:["USA","Irlanda","Australia","Inghilterra"],a:3},
  {q:"Cos'è il panettone?",opts:["Dolce natalizio milanese","Dolce romano","Pane pugliese","Torta siciliana"],a:0},
  {q:"Da dove proviene il salmone affumicato più famoso?",opts:["Norvegia","Scozia","Canada","Islanda"],a:0},
  {q:"Qual è l'ingrediente tipico del risotto nero veneziano?",opts:["Inchiostro di calamaro","Tartufo nero","Funghi porcini neri","Olive nere"],a:0},
  {q:"Cosa sono i canederli?",opts:["Pasta trentina","Gnocchi di pane tirolesi","Ravioli altoatesini","Zuppa locale"],a:1},
  {q:"Da dove proviene il Prosciutto di Parma?",opts:["Emilia-Romagna","Lombardia","Veneto","Toscana"],a:0},
  {q:"Cos'è il limoncello?",opts:["Vino campano","Liquore al limone campano","Birra siciliana","Amaro calabrese"],a:1},
  {q:"Quale è la pasta più consumata in Italia?",opts:["Penne","Rigatoni","Spaghetti","Fusilli"],a:2},
  {q:"Da dove proviene la pizza quattro stagioni?",opts:["Roma","Napoli","Nessuna origine precisa","Milano"],a:1},
  {q:"Cos'è il panforte?",opts:["Dolce natalizio senese","Pane toscano","Dolce amalfitano","Biscotto sardo"],a:0},
  {q:"Da dove proviene il Prosecco?",opts:["Piemonte","Toscana","Veneto e Friuli","Lombardia"],a:2},
  {q:"Qual è l'ingrediente base della bagna cauda piemontese?",opts:["Aglio e acciughe","Cipolla e burro","Lardo e rosmarino","Formaggio e vino"],a:0},
  {q:"Cos'è la ribollita?",opts:["Zuppa toscana di pane e verdure","Risotto lombardo","Secondo di carne sarda","Pasta pugliese"],a:0},
  {q:"Da dove proviene il formaggio Gouda?",opts:["Danimarca","Belgio","Olanda","Germania"],a:2},
  {q:"Cosa sono i supplì?",opts:["Arancini romani al telefono","Crocchette di patate","Frittelle di baccalà","Olive ascolane"],a:0},
  {q:"Qual è il vino rosso più famoso della Toscana?",opts:["Barolo","Amarone","Brunello di Montalcino","Sagrantino"],a:2},
  {q:"Da dove proviene il sake?",opts:["Cina","Corea","Giappone","Vietnam"],a:2},
  {q:"Cos'è la cacio e pepe?",opts:["Pasta romana con pecorino e pepe","Pasta napoletana","Formaggio stagionato sardo","Condimento siciliano"],a:0},
  {q:"Quale è il formaggio svizzero con i buchi?",opts:["Gruyère","Emmenthal","Raclette","Appenzell"],a:1},
  {q:"Da dove proviene la paella?",opts:["Barcellona","Valencia","Madrid","Siviglia"],a:1},
  {q:"Cos'è il Marsala?",opts:["Vino siciliano","Liquore calabrese","Birra pugliese","Aperitivo sardo"],a:0},
  {q:"Quale è l'ingrediente base del pesto alla trapanese?",opts:["Basilico e pinoli","Mandorle e pomodoro","Pistacchi","Ricotta e basilico"],a:1},
  {q:"Da dove proviene il Guinness?",opts:["Scozia","Galles","Irlanda","Inghilterra"],a:2},
  {q:"Cos'è la caponata?",opts:["Antipasto siciliano di melanzane","Zuppa napoletana","Pasta pugliese","Insalata calabrese"],a:0},
  {q:"Quale è la pasta tipica dell'Amatriciana?",opts:["Spaghetti","Bucatini","Rigatoni","Penne"],a:1},
  {q:"Da dove proviene il Cognac?",opts:["Bordeaux","Borgogna","Cognac (Charente)","Champagne"],a:2},
  {q:"Cos'è il lardo di Colonnata?",opts:["Lardo toscano stagionato nel marmo","Prosciutto toscano","Pancetta lombarda","Guanciale romano"],a:0},
  {q:"Quale è il formaggio più usato nella pizza napoletana tradizionale?",opts:["Fior di latte o mozzarella di bufala","Parmigiano","Grana Padano","Provola"],a:0},
  {q:"Da dove proviene il tè Darjeeling?",opts:["Cina","Sri Lanka","India (Bengala Occ.)","Nepal"],a:2},
  {q:"Cos'è il pecorino sardo?",opts:["Formaggio vaccino sardo","Formaggio ovino sardo","Formaggio caprino sardo","Formaggio misto sardo"],a:1},
  {q:"Quale è il dolce tipico veneziano di Carnevale?",opts:["Fritelle","Chiacchiere","Castagnole","Cicerchiata"],a:0},
  {q:"Da dove proviene il caffè?",opts:["Yemen","Etiopia","Arabia Saudita","India"],a:1},
  {q:"Cos'è la sfogliatella?",opts:["Dolce napoletano di pasta sfoglia con ricotta","Dolce siciliano","Biscotto romano","Torta milanese"],a:0},
  {q:"Quale è l'ingrediente base della béchamel?",opts:["Burro, farina e latte","Olio, farina e brodo","Panna e farina","Burro e panna"],a:0},
  {q:"Da dove proviene il Sangiovese?",opts:["Piemonte","Veneto","Toscana","Puglia"],a:2},
  {q:"Cos'è il Brunello di Montalcino?",opts:["Vino rosso toscano DOCG","Formaggio toscano","Grappa toscana","Olio toscano DOP"],a:0},
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
  {q:"Chi ha cantato Satisfaction?",opts:["Led Zeppelin","The Rolling Stones","Queen","The Who"],a:1},
  {q:"Quante corde ha una chitarra classica?",opts:["4","5","6","7"],a:2},
  {q:"Quanti tasti ha un pianoforte standard?",opts:["72","80","88","96"],a:2},
  {q:"Chi ha cantato Chandelier?",opts:["Sia","Ellie Goulding","Lana Del Rey","Lorde"],a:0},
  {q:"Chi ha cantato Royals?",opts:["Lana Del Rey","Sky Ferreira","Lorde","Grimes"],a:2},
  {q:"In quale paese è nato Mozart?",opts:["Germania","Svizzera","Austria","Italia"],a:2},
  {q:"Chi ha composto la Quinta Sinfonia?",opts:["Mozart","Bach","Beethoven","Brahms"],a:2},
  {q:"Quale strumento suonava Jimi Hendrix?",opts:["Basso","Batteria","Chitarra","Tastiere"],a:2},
  {q:"Chi ha cantato Purple Rain?",opts:["Michael Jackson","Prince","James Brown","Stevie Wonder"],a:1},
  {q:"Quale band ha inciso Smells Like Teen Spirit?",opts:["Pearl Jam","Soundgarden","Nirvana","Alice in Chains"],a:2},
  {q:"Chi ha cantato Poker Face?",opts:["Kesha","Katy Perry","Lady Gaga","Rihanna"],a:2},
  {q:"Quale band ha inciso Mr. Brightside?",opts:["The Strokes","Interpol","The Killers","Franz Ferdinand"],a:2},
  {q:"Chi ha cantato Umbrella?",opts:["Beyoncé","Rihanna","Ciara","Ashanti"],a:1},
  {q:"Quale band ha inciso Seven Nation Army?",opts:["The Strokes","The White Stripes","The Vines","The Hives"],a:1},
  {q:"Chi ha cantato Crazy in Love?",opts:["Alicia Keys","Mary J. Blige","Beyoncé","Ciara"],a:2},
  {q:"Chi ha cantato In Da Club?",opts:["Jay-Z","Kanye West","50 Cent","Lil Wayne"],a:2},
  {q:"Chi ha cantato Diamonds?",opts:["Beyoncé","Rihanna","Katy Perry","Selena Gomez"],a:1},
  {q:"Chi ha composto Il Barbiere di Siviglia?",opts:["Puccini","Rossini","Bellini","Verdi"],a:1},
  {q:"Chi ha composto Le Quattro Stagioni?",opts:["Bach","Handel","Vivaldi","Telemann"],a:2},
  {q:"Quale band ha inciso Comfortably Numb?",opts:["The Who","Yes","Pink Floyd","Genesis"],a:2},
  {q:"Chi ha cantato Someone Like You?",opts:["Beyoncé","Rihanna","Adele","Amy Winehouse"],a:2},
  {q:"Quale band ha inciso Paranoid?",opts:["Iron Maiden","Judas Priest","Black Sabbath","Dio"],a:2},
  {q:"Chi ha cantato Baby One More Time?",opts:["Christina Aguilera","Britney Spears","Jessica Simpson","Mandy Moore"],a:1},
  {q:"Chi ha cantato Hips Don't Lie?",opts:["Jennifer Lopez","Shakira","Rihanna","Beyoncé"],a:1},
  {q:"Quale band ha inciso Don't Stop Believin'?",opts:["Boston","Foreigner","Journey","Kansas"],a:2},
  {q:"Chi ha cantato Hello (2015)?",opts:["Beyoncé","Rihanna","Adele","Amy Winehouse"],a:2},
  {q:"Quale band ha inciso November Rain?",opts:["Aerosmith","Metallica","Guns N' Roses","Bon Jovi"],a:2},
  {q:"Chi ha cantato Stay With Me?",opts:["Ed Sheeran","James Bay","Sam Smith","James Blunt"],a:2},
  {q:"Chi ha cantato Titanium?",opts:["Avicii","David Guetta e Sia","Calvin Harris","Skrillex"],a:1},
  {q:"Chi ha cantato Wake Me Up?",opts:["Martin Garrix","David Guetta","Avicii","Tiesto"],a:2},
  {q:"Chi ha cantato Levels?",opts:["Avicii","Calvin Harris","Skrillex","Deadmau5"],a:0},
  {q:"Chi ha cantato Riptide?",opts:["Vance Joy","Ed Sheeran","John Mayer","Jack Johnson"],a:0},
  {q:"Chi ha cantato Let Her Go?",opts:["Vance Joy","Passenger","Ed Sheeran","James Bay"],a:1},
  {q:"Chi ha cantato Counting Stars?",opts:["Imagine Dragons","Bastille","OneRepublic","Maroon 5"],a:2},
  {q:"Chi ha cantato Radioactive?",opts:["Bastille","OneRepublic","Imagine Dragons","Coldplay"],a:2},
  {q:"Chi ha cantato Pompeii?",opts:["Imagine Dragons","Bastille","Elbow","Editors"],a:1},
  {q:"Chi ha cantato Fix You?",opts:["Radiohead","Muse","Coldplay","U2"],a:2},
  {q:"Chi ha cantato Creep?",opts:["Radiohead","Muse","Coldplay","U2"],a:0},
  {q:"Chi ha cantato Uprising?",opts:["Radiohead","Muse","Coldplay","U2"],a:1},
  {q:"Chi ha cantato With or Without You?",opts:["Radiohead","Muse","Coldplay","U2"],a:3},
  {q:"Chi ha cantato Light My Fire?",opts:["The Beatles","The Rolling Stones","The Doors","The Kinks"],a:2},
  {q:"Chi ha cantato Paint It Black?",opts:["The Beatles","The Rolling Stones","The Doors","The Kinks"],a:1},
  {q:"Chi ha cantato Come as You Are?",opts:["Pearl Jam","Soundgarden","Nirvana","Stone Temple Pilots"],a:2},
  {q:"Chi ha cantato Everlong?",opts:["Foo Fighters","Nirvana","Weezer","Pixies"],a:0},
  {q:"Chi ha cantato All the Small Things?",opts:["Green Day","Blink-182","Sum 41","The Offspring"],a:1},
  {q:"Chi ha cantato Basket Case?",opts:["Green Day","Blink-182","Sum 41","The Offspring"],a:0},
  {q:"Chi ha cantato Boulevard of Broken Dreams?",opts:["Green Day","Blink-182","Sum 41","My Chemical Romance"],a:0},
  {q:"Chi ha cantato Welcome to the Black Parade?",opts:["Green Day","Blink-182","Sum 41","My Chemical Romance"],a:3},
  {q:"Chi ha cantato Empire State of Mind?",opts:["Jay-Z e Alicia Keys","Nas","Biggie","Kanye West"],a:0},
  {q:"Chi ha cantato HUMBLE?",opts:["J. Cole","Kendrick Lamar","Drake","Travis Scott"],a:1},
  {q:"Chi ha cantato God's Plan?",opts:["J. Cole","Kendrick Lamar","Drake","Travis Scott"],a:2},
  {q:"Chi ha cantato WAP?",opts:["Nicki Minaj","Cardi B","Megan Thee Stallion","Doja Cat"],a:1},
  {q:"Chi ha cantato New Rules?",opts:["Dua Lipa","Ariana Grande","Selena Gomez","Halsey"],a:0},
  {q:"Chi ha cantato Thank U Next?",opts:["Dua Lipa","Ariana Grande","Selena Gomez","Halsey"],a:1},
  {q:"Chi ha cantato Perfect?",opts:["Sam Smith","Harry Styles","Ed Sheeran","James Bay"],a:2},
  {q:"Chi ha cantato Thinking Out Loud?",opts:["Sam Smith","Harry Styles","Ed Sheeran","James Bay"],a:2},
  {q:"Chi ha cantato Watermelon Sugar?",opts:["Niall Horan","Louis Tomlinson","Harry Styles","Liam Payne"],a:2},
  {q:"Chi ha cantato Sign of the Times?",opts:["Niall Horan","Louis Tomlinson","Harry Styles","Liam Payne"],a:2},
  {q:"Chi ha cantato All Star?",opts:["311","Sublime","No Doubt","Smash Mouth"],a:3},
  {q:"Chi ha cantato Don't Speak?",opts:["311","Sublime","No Doubt","Smash Mouth"],a:2},
  {q:"Chi ha cantato Livin la Vida Loca?",opts:["Marc Anthony","Lou Bega","Ricky Martin","Enrique Iglesias"],a:2},
  {q:"Chi ha cantato Hero?",opts:["Marc Anthony","Enrique Iglesias","Ricky Martin","Lou Bega"],a:1},
  {q:"Chi ha cantato La Isla Bonita?",opts:["Shakira","Ricky Martin","Madonna","Jennifer Lopez"],a:2},
  {q:"Chi ha cantato Vogue?",opts:["Shakira","Ricky Martin","Madonna","Jennifer Lopez"],a:2},
  {q:"Chi ha cantato Waka Waka?",opts:["Jennifer Lopez","Beyoncé","Rihanna","Shakira"],a:3},
  {q:"Chi ha cantato Halo?",opts:["Alicia Keys","Rihanna","Beyoncé","Kelly Rowland"],a:2},
  {q:"Chi ha cantato No One?",opts:["Beyoncé","Rihanna","Alicia Keys","Mary J. Blige"],a:2},
  {q:"Chi ha cantato Rocket Man?",opts:["Elton John","Billy Joel","David Bowie","Queen"],a:0},
  {q:"Chi ha cantato Space Oddity?",opts:["Elton John","Billy Joel","David Bowie","Queen"],a:2},
  {q:"Chi ha cantato Heroes?",opts:["Elton John","Billy Joel","David Bowie","Queen"],a:2},
  {q:"Chi ha cantato Whole Lotta Love?",opts:["Led Zeppelin","The Rolling Stones","Queen","The Who"],a:0},
  {q:"Chi ha cantato My Generation?",opts:["Led Zeppelin","The Rolling Stones","Queen","The Who"],a:3},
  {q:"Come si chiama la voce più grave nel canto classico maschile?",opts:["Tenore","Baritono","Basso","Controtenore"],a:2},
  {q:"Come si chiama la voce femminile più acuta?",opts:["Mezzosoprano","Contralto","Soprano","Mezzo"],a:2},
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
  {q:"Chi ha diretto Il Signore degli Anelli?",opts:["Cameron","Spielberg","Jackson","Scott"],a:2},
  {q:"In quale anno uscì Titanic?",opts:["1995","1997","1999","2001"],a:1},
  {q:"Chi ha vinto l'Oscar come miglior film nel 2020?",opts:["1917","Joker","Parasite","C'era una volta a Hollywood"],a:2},
  {q:"Chi ha diretto Schindler's List?",opts:["Coppola","Kubrick","Spielberg","Scorsese"],a:2},
  {q:"Quale attore ha interpretato Rocky Balboa?",opts:["Schwarzenegger","Stallone","Van Damme","Norris"],a:1},
  {q:"Quale attore ha interpretato Terminator?",opts:["Stallone","Willis","Schwarzenegger","Norris"],a:2},
  {q:"Chi ha diretto il primo Terminator?",opts:["Scott","Spielberg","Cameron","Lucas"],a:2},
  {q:"Quale attrice ha interpretato Ripley in Alien?",opts:["Sigourney Weaver","Jamie Lee Curtis","Linda Hamilton","Jodie Foster"],a:0},
  {q:"Quale attore ha interpretato Indiana Jones?",opts:["Ford","Gibson","Cruise","Eastwood"],a:0},
  {q:"Chi ha diretto il primo Indiana Jones?",opts:["Lucas","Spielberg","Cameron","Scott"],a:1},
  {q:"Quale attore ha interpretato Michael Corleone in Il Padrino?",opts:["De Niro","Brando","Pacino","Nicholson"],a:2},
  {q:"Quale attore ha interpretato Tony Montana in Scarface?",opts:["De Niro","Pacino","Nicholson","Brando"],a:1},
  {q:"Chi ha interpretato Hannibal Lecter in Il Silenzio degli Innocenti?",opts:["De Niro","Hopkins","Nicholson","Pacino"],a:1},
  {q:"Chi ha diretto The Social Network?",opts:["Fincher","Nolan","Spielberg","Scott"],a:0},
  {q:"Chi interpreta Mark Zuckerberg in The Social Network?",opts:["Jesse Eisenberg","Justin Timberlake","Andrew Garfield","Armie Hammer"],a:0},
  {q:"Chi ha diretto Interstellar?",opts:["Spielberg","Cameron","Villeneuve","Nolan"],a:3},
  {q:"Chi ha interpretato Jack in Titanic?",opts:["Brad Pitt","Tom Hanks","Leonardo DiCaprio","Matt Damon"],a:2},
  {q:"Chi ha diretto Gravity?",opts:["Cuarón","Cameron","Nolan","Scott"],a:0},
  {q:"Chi ha interpretato Matt Kowalski in Gravity?",opts:["Tom Hanks","George Clooney","Brad Pitt","Matt Damon"],a:1},
  {q:"Chi ha interpretato Ryan Stone in Gravity?",opts:["Cate Blanchett","Scarlett Johansson","Sandra Bullock","Julia Roberts"],a:2},
  {q:"Chi ha diretto The Revenant?",opts:["Villeneuve","Cuarón","González Iñárritu","Nolan"],a:2},
  {q:"Chi ha interpretato Hugh Glass in The Revenant?",opts:["Tom Hardy","Leonardo DiCaprio","McConaughey","Cruise"],a:1},
  {q:"Chi ha vinto l'Oscar come miglior film nel 2022?",opts:["Power of the Dog","CODA","Dune","Belfast"],a:1},
  {q:"Chi ha diretto Dune (2021)?",opts:["Nolan","Scott","Villeneuve","Snyder"],a:2},
  {q:"Chi ha vinto l'Oscar come miglior film nel 2023?",opts:["Avatar 2","Tár","Everything Everywhere All at Once","The Fabelmans"],a:2},
  {q:"Chi ha vinto l'Oscar come miglior attrice nel 2023?",opts:["Cate Blanchett","Michelle Yeoh","Ana de Armas","Andrea Riseborough"],a:1},
  {q:"Quale film ha vinto l'Oscar come miglior film nel 2024?",opts:["Oppenheimer","Poor Things","Anatomia di una caduta","Zone of Interest"],a:0},
  {q:"Chi ha diretto Squid Game?",opts:["Bong Joon-ho","Park Chan-wook","Hwang Dong-hyuk","Kim Ji-woon"],a:2},
  {q:"Su quale piattaforma è disponibile Squid Game?",opts:["HBO","Disney+","Netflix","Amazon Prime"],a:2},
  {q:"Chi ha interpretato Sherlock Holmes nella serie BBC?",opts:["Martin Freeman","Benedict Cumberbatch","David Tennant","Tom Hiddleston"],a:1},
  {q:"Chi ha interpretato Frank Underwood in House of Cards USA?",opts:["Kevin Spacey","Bryan Cranston","Jeff Daniels","Michael Sheen"],a:0},
  {q:"Quale serie parla di hacker e anarchia digitale?",opts:["Silicon Valley","Mr. Robot","Halt and Catch Fire","Devs"],a:1},
  {q:"Chi interpreta Dexter Morgan?",opts:["Michael C. Hall","Kevin Bacon","Patrick Dempsey","James Roday"],a:0},
  {q:"Chi ha creato Breaking Bad?",opts:["Vince Gilligan","David Chase","Matthew Weiner","Alan Ball"],a:0},
  {q:"Chi interpreta il protagonista di Peaky Blinders?",opts:["Tom Hardy","Cillian Murphy","Paul Anderson","Joe Cole"],a:1},
  {q:"Dove è ambientata Peaky Blinders?",opts:["Manchester","Londra","Birmingham","Liverpool"],a:2},
  {q:"Chi ha diretto Birdman?",opts:["Villeneuve","Cuarón","González Iñárritu","Nolan"],a:2},
  {q:"Chi ha diretto Fight Club?",opts:["Tarantino","Fincher","Nolan","Kubrick"],a:1},
  {q:"Quale attore ha interpretato Tyler Durden in Fight Club?",opts:["Norton","Pitt","Spacey","Damon"],a:1},
  {q:"Chi ha diretto The Dark Knight?",opts:["Snyder","Spielberg","Nolan","Scott"],a:2},
  {q:"Chi ha interpretato Joker nel Dark Knight?",opts:["Jack Nicholson","Heath Ledger","Jared Leto","Joaquin Phoenix"],a:1},
  {q:"Quale attore ha interpretato Superman in Man of Steel?",opts:["Reeve","Cavill","Routh","Affleck"],a:1},
  {q:"Chi ha interpretato Thor nel MCU?",opts:["Chris Evans","Chris Pratt","Chris Hemsworth","Chris Pine"],a:2},
  {q:"Chi ha interpretato Captain America nel MCU?",opts:["Chris Evans","Chris Pratt","Chris Hemsworth","Chris Pine"],a:0},
  {q:"Chi ha interpretato Spider-Man nel MCU?",opts:["Andrew Garfield","Tobey Maguire","Tom Holland","Dylan O'Brien"],a:2},
  {q:"Chi ha interpretato Black Panther nel MCU?",opts:["Idris Elba","Michael B. Jordan","Chadwick Boseman","Winston Duke"],a:2},
  {q:"Chi ha interpretato Doctor Strange nel MCU?",opts:["Tom Hiddleston","Benedict Cumberbatch","Chiwetel Ejiofor","Tilda Swinton"],a:1},
  {q:"Chi ha interpretato Loki nel MCU?",opts:["Tom Hiddleston","Chris Hemsworth","Benedict Cumberbatch","Mark Ruffalo"],a:0},
  {q:"Chi ha interpretato Thanos nel MCU?",opts:["Ron Perlman","Terry Crews","Josh Brolin","Vin Diesel"],a:2},
  {q:"Chi ha interpretato Wolverine nei film X-Men?",opts:["Hugh Jackman","Liam Neeson","Christian Bale","Russell Crowe"],a:0},
  {q:"In quale anno uscì Avatar?",opts:["2007","2009","2011","2013"],a:1},
  {q:"Chi ha interpretato il Re Leone (versione live 2019, voce di Simba)?",opts:["Childish Gambino","Donald Glover","Will Smith","Idris Elba"],a:1},
  {q:"Chi ha interpretato la Sirenetta nel film live-action 2023?",opts:["Zendaya","Halle Bailey","Nathalie Emmanuel","Storm Reid"],a:1},
  {q:"Chi ha interpretato il Genio in Aladdin live-action 2019?",opts:["Eddie Murphy","Will Smith","Chris Rock","Kevin Hart"],a:1},
  {q:"Quante stagioni ha Il Trono di Spade?",opts:["6","7","8","9"],a:2},
  {q:"Chi crea i draghi in Game of Thrones?",opts:["Cersei","Daenerys","Sansa","Arya"],a:1},
  {q:"Quante stagioni ha Friends?",opts:["8","9","10","11"],a:2},
  {q:"In quale ospedale è ambientata Grey's Anatomy?",opts:["Sacred Heart","Seattle Grace","County General","Princeton-Plainsboro"],a:1},
  {q:"In quale città è ambientata Stranger Things?",opts:["Chicago","Hawkins","Portland","Denver"],a:1},
  {q:"Chi ha creato la serie Dark?",opts:["Autori americani","Baran bo Odar e Jantje Friese","Netflix","Hulu"],a:1},
  {q:"In quale paese è ambientata la serie Dark?",opts:["Austria","Svizzera","Germania","Olanda"],a:2},
  {q:"Chi ha vinto l'Oscar come miglior attore nel 2020?",opts:["Joaquin Phoenix","Antonio Banderas","Adam Driver","Leonardo DiCaprio"],a:0},
  {q:"Chi ha diretto La La Land?",opts:["Villeneuve","Cuarón","Chazelle","Nolan"],a:2},
  {q:"Chi interpreta Mia in La La Land?",opts:["Emma Stone","Natalie Portman","Keira Knightley","Olivia Colman"],a:0},
  {q:"Quale serie è basata su 'Il racconto dell'ancella'?",opts:["Alias Grace","The Handmaid's Tale","Sharp Objects","Big Little Lies"],a:1},
  {q:"Chi ha creato Stranger Things?",opts:["Duffer Brothers","JJ Abrams","Ryan Murphy","Shonda Rhimes"],a:0},
  {q:"Quale rete trasmette Stranger Things?",opts:["HBO","Amazon","Netflix","Disney+"],a:2},
  {q:"Da quale paese proviene il film Parasite?",opts:["Giappone","Cina","Corea del Sud","Taiwan"],a:2},
  {q:"Chi ha diretto Roma (2018)?",opts:["Villeneuve","Cuarón","González Iñárritu","Nolan"],a:1},
  {q:"Chi ha vinto l'Oscar come miglior film nel 2019?",opts:["Roma","BlackkKlansman","Green Book","The Favourite"],a:2},
  {q:"Chi ha interpretato la protagonista in Joker (2019)?",opts:["Zazie Beetz","Frances McDormand","Margot Robbie","Emma Stone"],a:0},
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
  {q:"In quale sport si usa il termine birdie?",opts:["Tennis","Badminton","Golf","Cricket"],a:2},
  {q:"Chi ha vinto più Slam nel tennis femminile?",opts:["Navratilova","Graf","Williams S.","Evert"],a:2},
  {q:"Quante buche ha un campo da golf standard?",opts:["9","12","18","24"],a:2},
  {q:"Chi ha vinto più ori olimpici nella ginnastica?",opts:["Comăneci","Khorkina","Latynina","Comaneci"],a:2},
  {q:"Quante squadre partecipano ai Mondiali di calcio?",opts:["24","32","36","48"],a:1},
  {q:"In quale sport si gareggia per la Stanley Cup?",opts:["Basketball","Football americano","Hockey su ghiaccio","Baseball"],a:2},
  {q:"Chi ha vinto più Mondiali di Coppe del Mondo di rugby?",opts:["Sudafrica","Australia","Nuova Zelanda","Inghilterra"],a:2},
  {q:"In quale anno si sono tenute le Olimpiadi di Roma?",opts:["1956","1960","1964","1968"],a:1},
  {q:"Quante squadre ci sono nella Premier League inglese?",opts:["16","18","20","22"],a:2},
  {q:"In quale sport si usa il termine ippon?",opts:["Karate","Judo","Entrambi","Taekwondo"],a:2},
  {q:"Quante corsie ha una piscina olimpica?",opts:["6","7","8","9"],a:2},
  {q:"Chi ha vinto più ori olimpici nel ciclismo?",opts:["Cavendish","Wiggins","Hoy","Kenny"],a:3},
  {q:"Chi detiene il record del salto in alto?",opts:["Sotomayor","Fosbury","Sjöberg","Lysenko"],a:0},
  {q:"In quale sport si usa il termine dressage?",opts:["Pattinaggio","Equitazione","Ginnastica","Nuoto sinc."],a:1},
  {q:"Quante tappe ha il Giro d'Italia tipicamente?",opts:["18","19","21","23"],a:2},
  {q:"Chi ha vinto più ori olimpici nel judo?",opts:["Nomura","Parisi","Geesink","Ruska"],a:0},
  {q:"In quale sport si usa il termine par?",opts:["Cricket","Badminton","Golf","Tennis"],a:2},
  {q:"Quanti punti vale un calcio di punizione nel rugby?",opts:["2","3","4","5"],a:1},
  {q:"In quale sport si gareggia per la Ryder Cup?",opts:["Tennis","Golf","Cricket","Polo"],a:1},
  {q:"Chi ha vinto più ori olimpici nel tiro con l'arco?",opts:["Son","Pace","Kim","Park"],a:2},
  {q:"Chi ha vinto più medaglie d'oro olimpiche nella storia?",opts:["Latynina","Phelps","Lewis","Spitz"],a:1},
  {q:"Quante medaglie ha vinto Phelps alle Olimpiadi in totale?",opts:["18","22","28","31"],a:2},
  {q:"Chi detiene il record del salto in lungo?",opts:["Lewis","Powell","Beamon","Johnson"],a:2},
  {q:"In quale anno si sono tenute le Olimpiadi di Barcellona?",opts:["1988","1992","1996","2000"],a:1},
  {q:"In quale anno si sono tenute le prime Olimpiadi moderne?",opts:["1888","1896","1900","1904"],a:1},
  {q:"Chi ha vinto più titoli NBA nella storia?",opts:["Jordan","James","Bryant","Russell"],a:3},
  {q:"Quante squadre ci sono in Bundesliga?",opts:["16","18","20","22"],a:1},
  {q:"Chi ha vinto più ori olimpici nel nuoto a rana?",opts:["Wilkie","Biondi","Hansen","Koseki"],a:2},
  {q:"Chi è il portiere più forte della storia del calcio secondo molti esperti?",opts:["Casillas","Buffon","Yashin","Neuer"],a:2},
  {q:"Quante vittorie ha vinto Valentino Rossi in MotoGP?",opts:["55","89","115","125"],a:1},
  {q:"In quale anno l'Italia ha vinto i Mondiali di calcio più recentemente?",opts:["1994","1998","2002","2006"],a:3},
  {q:"Chi ha vinto la pallone d'oro più volte in assoluto?",opts:["Ronaldo C.","Messi","Ronaldo B.","Platini"],a:1},
  {q:"Quante volte ha vinto il Brasile la Coppa del Mondo?",opts:["3","4","5","6"],a:2},
  {q:"In quale sport si usa il termine axel?",opts:["Pattinaggio artistico","Sci","Ginnastica","Trampolino"],a:0},
  {q:"Chi ha vinto più Mondiali di sci alpino?",opts:["Stenmark","Tomba","Vonn","Maze"],a:0},
  {q:"Quanti giocatori ci sono in campo nel football americano?",opts:["9","10","11","12"],a:2},
  {q:"In quale sport si usa il termine home run?",opts:["Cricket","Softball","Baseball","Rounders"],a:2},
  {q:"Chi ha vinto più ori olimpici nella lotta?",opts:["Medved","Schultz","Karelin","Blagoev"],a:2},
  {q:"Quante volte l'Argentina ha vinto la Coppa del Mondo?",opts:["1","2","3","4"],a:2},
  {q:"Chi è il giocatore di basket più alto della storia NBA?",opts:["Manute Bol","Yao Ming","Boban Marjanovic","Gheorge Muresan"],a:0},
  {q:"In quale sport si usa il termine shuttlecock?",opts:["Tennis","Badminton","Squash","Racquetball"],a:1},
  {q:"Quante volte Federer ha vinto Wimbledon?",opts:["5","6","7","8"],a:3},
  {q:"Chi ha vinto più Mondiali di F1 negli anni 2000?",opts:["Schumacher","Hamilton","Alonso","Vettel"],a:0},
  {q:"In quale anno si sono tenute le Olimpiadi di Tokyo (moderne)?",opts:["2019","2020","2021","2022"],a:2},
  {q:"Chi è il miglior marcatore della storia della Nazionale Italiana?",opts:["Del Piero","Totti","Mazzola","Riva"],a:3},
  {q:"Quante volte ha vinto Nadal il Roland Garros?",opts:["10","12","14","16"],a:2},
  {q:"In quale sport si gareggia per la Davis Cup?",opts:["Badminton","Squash","Tennis","Ping pong"],a:2},
  {q:"Chi ha segnato il gol di mano di Dio ai Mondiali 1986?",opts:["Pelé","Maradona","Zidane","Ronaldo"],a:1},
  {q:"Quanti giocatori ci sono in una squadra di pallavolo?",opts:["5","6","7","8"],a:1},
  {q:"In quale sport si usa il termine peloton?",opts:["Ciclismo","Atletica","Sci","Automobilismo"],a:0},
  {q:"Chi è il capocannoniere di tutti i tempi della Serie A?",opts:["Totti","Del Piero","Nordahl","Piola"],a:3},
  {q:"Quante volte ha vinto l'Italia l'Europeo di calcio?",opts:["2","3","4","5"],a:1},
  {q:"In quale sport si gareggia per la Coppa America?",opts:["Golf","Tennis","Vela","Polo"],a:2},
  {q:"Chi ha vinto la Coppa del Mondo 2018?",opts:["Brasile","Germania","Francia","Croazia"],a:2},
  {q:"In quale anno si sono tenute le Olimpiadi di Londra più recenti?",opts:["2008","2012","2016","2020"],a:1},
  {q:"Chi è il più giovane vincitore di un titolo del Grande Slam nel tennis?",opts:["Nadal","Federer","Chang","Wilander"],a:2},
  {q:"Quante volte ha vinto il Brasile la Copa América?",opts:["8","9","10","11"],a:1},
  {q:"In quale anno si tennero le Olimpiadi di Los Angeles?",opts:["1976","1980","1984","1988"],a:2},
  {q:"Chi ha vinto la Champions League più volte?",opts:["Milan","Barcellona","Bayern Monaco","Real Madrid"],a:3},
  {q:"Quante volte il Real Madrid ha vinto la Champions League?",opts:["12","13","14","15"],a:3},
  {q:"Chi è il miglior marcatore della storia della Champions League?",opts:["Messi","Ronaldo C.","Raúl","Benzema"],a:1},
  {q:"In quale sport si usa il termine par 4?",opts:["Tennis","Golf","Cricket","Baseball"],a:1},
  {q:"Quanti giocatori compongono una squadra di cricket?",opts:["9","10","11","12"],a:2},
  {q:"Chi ha vinto la medaglia d'oro nei 100m alle Olimpiadi 2008?",opts:["Asafa Powell","Usain Bolt","Tyson Gay","Maurice Greene"],a:1},
  {q:"Chi è il capocannoniere di tutti i tempi ai Mondiali?",opts:["Pelé","Ronaldo B.","Müller","Klose"],a:3},
  {q:"In quale anno si è tenuta la prima Coppa del Mondo di calcio?",opts:["1926","1930","1934","1938"],a:1},
  {q:"Quante medaglie ha vinto l'Italia alle Olimpiadi di Tokyo 2020?",opts:["20","30","40","50"],a:2},
  {q:"Chi ha vinto l'oro nei 100m femminili alle Olimpiadi 2021?",opts:["Shelly-Ann Fraser-Pryce","Elaine Thompson-Herah","Dafne Schippers","Marie-Josée Ta Lou"],a:1},
  {q:"Quale calciatore è soprannominato 'Il Fenomeno'?",opts:["Zidane","Ronaldo Brasileiro","Ronaldo C.","Ronaldinho"],a:1},
  {q:"Quale è il più antico torneo di tennis del mondo?",opts:["Roland Garros","US Open","Australian Open","Wimbledon"],a:3},
  {q:"In quale sport gareggia Marcell Jacobs?",opts:["Salto in lungo","Salto in alto","100m piani","Decathlon"],a:2},
  {q:"Chi ha vinto l'oro nei 100m maschili alle Olimpiadi 2020?",opts:["Usain Bolt","Christian Coleman","Marcell Jacobs","Fred Kerley"],a:2},
  {q:"Quante volte Schumacher ha vinto il titolo mondiale F1?",opts:["5","6","7","8"],a:2},
  {q:"Chi è il capocannoniere di tutti i tempi della Coppa del Mondo femminile?",opts:["Marta","Abby Wambach","Sun Wen","Mia Hamm"],a:0},
  {q:"In quale anno si è tenuta la prima Olimpiade moderna?",opts:["1888","1892","1896","1900"],a:2},
  {q:"Qual è il record mondiale dei 100m maschili?",opts:["9.56","9.58","9.63","9.72"],a:1},
  {q:"Chi ha vinto la Coppa del Mondo di rugby 2023?",opts:["Nuova Zelanda","Sudafrica","Francia","Irlanda"],a:1},
  {q:"Quante volte Novak Djokovic ha vinto gli Australian Open?",opts:["7","8","9","10"],a:3},
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
  {q:"Io parlo senza bocca, sento senza orecchie. Cosa sono?",opts:["Un sogno","Un eco","Il vento","Un pensiero"],a:1},
  {q:"Cosa ha denti ma non morde?",opts:["Un pettine","Un rastrello","Una sega","Un pettine e un rastrello"],a:3},
  {q:"Se un aereo si schianta sul confine tra due paesi, dove si seppelliscono i superstiti?",opts:["Nel paese più vicino","A metà","I superstiti non si seppelliscono","Nel paese di origine"],a:2},
  {q:"Cosa diventa più bagnata man mano che asciuga?",opts:["Una spugna","Un asciugamano","Una pelle di camoscio","La sabbia"],a:1},
  {q:"Qual è la parola che tutti pronunciano sempre sbagliata?",opts:["Sbagliata","Pronuncia","Difficile","Errata"],a:0},
  {q:"Cosa è sempre di fronte a te ma non puoi vederla?",opts:["Il futuro","Il naso","Il passato","La mente"],a:0},
  {q:"Cosa si può tenere nella mano destra ma non nella sinistra?",opts:["Un segreto","La mano destra","Il polso","Un oggetto pesante"],a:1},
  {q:"Cosa cammina tutto il giorno e alla fine è nello stesso posto?",opts:["Una formica","Un orologio","I piedi","Un mulino"],a:1},
  {q:"Cosa può viaggiare in tutto il mondo senza muoversi?",opts:["La luce","Un francobollo","Internet","Il vento"],a:1},
  {q:"Ha gambe ma non può camminare. Cosa sono?",opts:["Un tavolo","Una sedia","Un letto","Tutti e tre"],a:3},
  {q:"Se cinque gatti prendono cinque topi in cinque minuti, quanto tempo ci vuole a un gatto per prendere un topo?",opts:["1 minuto","5 minuti","25 minuti","Non può"],a:1},
  {q:"Cosa sale ma non scende mai?",opts:["L'età","Il sole","Il fumo","La marea"],a:0},
  {q:"Se hai 3 mele in una stanza buia e ne prendi 2, quante mele hai?",opts:["0","1","2","3"],a:2},
  {q:"Dove finisce sempre l'estate?",opts:["In autunno","Al mare","Nella lettera E","A settembre"],a:2},
  {q:"Cosa è sempre in mezzo ma non al centro?",opts:["La lettera E","La lettera I","La lettera A","La lettera O"],a:0},
  {q:"Quale parola diventa più corta aggiungendo lettere?",opts:["Breve","Corta","Short","Lunga"],a:2},
  {q:"Se un medico ti dà 3 pillole ogni mezzora, quanto dura la cura?",opts:["3 ore","1 ora","1 ora e 30 min","90 minuti"],a:1},
  {q:"Ho radici che nessuno vede, sono più alto degli alberi, non cresco mai. Cosa sono?",opts:["Una montagna","Un grattacielo","Una nuvola","La nebbia"],a:0},
  {q:"Mary ha 4 figli. La metà dei figli di Mary sono maschi. Com'è possibile?",opts:["Non è possibile","Tutti e 4 sono maschi","2 sono maschi e 2 femmine","Metafora"],a:2},
  {q:"Cosa si può dividere senza tagliare?",opts:["La pizza","Il tempo","Un gruppo","Il cibo"],a:1},
  {q:"Cosa si può vedere solo di notte?",opts:["La luna","Le stelle","Il buio","L'aurora"],a:1},
  {q:"Ha molte chiavi ma non apre porte. Uno strumento che...?",opts:["Tastiera del computer","Pianoforte","Entrambi","Fisarmonica"],a:2},
  {q:"Cosa è sempre uguale ma non è mai lo stesso?",opts:["Il numero uno","Il tempo","Un clone","Lo specchio"],a:1},
  {q:"Se lanci una pallina rossa nel Mar Rosso, che cosa diventa?",opts:["Rossa bagnata","Bagnata","Rossa","Affondata"],a:1},
  {q:"Cosa si fa crescere tagliandola?",opts:["L'erba","I capelli","Entrambi","La barba"],a:3},
  {q:"Ho mani ma non posso battere le mani. Cosa sono?",opts:["Un guanto","Un orologio","Un manichino","Un robot"],a:1},
  {q:"Va e viene ma non si muove mai. Cosa è?",opts:["Il mare","Il sole","Una porta","La strada"],a:2},
  {q:"Inizia con E, finisce con E ma ha una sola lettera. Cosa è?",opts:["Elettricità","Una busta","Erba","Estate"],a:1},
  {q:"Quale lettera viene dopo C nella parola CIELO?",opts:["I","E","L","O"],a:0},
  {q:"Cosa ha la vacca che non ha il toro?",opts:["Le corna","Il latte","La lettera V","La coda"],a:2},
  {q:"Cosa pesa di più: un kg di piombo o un kg di cotone?",opts:["Il piombo","Il cotone","Pesano uguale","Dipende dalla gravità"],a:2},
  {q:"Un libro ha 200 pagine. Se strappi una pagina ogni giorno, in quanti giorni finisce?",opts:["200","100","199","Dipende"],a:1},
  {q:"Quante volte puoi sottrarre 5 da 25?",opts:["5 volte","Infinite","Solo 1 volta","3 volte"],a:2},
  {q:"Se 1+1=2 e 2+2=4, quanto fa 4+4?",opts:["6","7","8","9"],a:2},
  {q:"Cosa ha occhi ma non vede, bocca ma non parla?",opts:["Una maschera","Una fotografia","Una bambola","Una statua"],a:0},
  {q:"Un uomo costruisce una casa con 4 lati, tutti esposti a sud. Un orso si avvicina. Di che colore è?",opts:["Marrone","Nero","Bianco","Grigio"],a:2},
  {q:"Cosa cresce verso il basso?",opts:["Una stalattite","Una stalagmite","Una radice","Un ghiacciolo"],a:0},
  {q:"Quale numero non è né pari né dispari?",opts:["0","1","Nessuno","Infinito"],a:0},
  {q:"Se ci sono 12 pesci in un acquario e ne muoiono 3, quanti ne restano?",opts:["9","12","3","0"],a:1},
  {q:"Cosa fa il re quando siede sul trono?",opts:["Comanda","Si riposa","Si siede","Governa"],a:2},
  {q:"Quante porte deve aprire un cieco in una stanza con 4 porte per uscire?",opts:["4","3","Dipende","1 se è quella giusta"],a:3},
  {q:"Se ci sono 6 mele in un cesto e ne togli 4, quante mele hai?",opts:["2","4","6","0"],a:1},
  {q:"Cosa puoi tenere senza toccarla?",opts:["La propria ombra","Il respiro","La parola data","Il proprio nome"],a:2},
  {q:"Qual è il mese con 28 giorni?",opts:["Solo febbraio","Tutti i mesi","Nessuno","Solo febbraio nell'anno bisestile"],a:1},
  {q:"Se un aereo vola dall'Italia al Canada in 9 ore, quanto impiega a tornare?",opts:["Meno di 9 ore","Esattamente 9 ore","Più di 9 ore","Dipende dal vento"],a:3},
  {q:"Quanti animali di ogni tipo Mosè portò sull'arca?",opts:["2","7","Mosè non aveva un'arca","14"],a:2},
  {q:"Cosa puoi rompere solo parlandone?",opts:["Il silenzio","Un segreto","La pace","Il ghiaccio"],a:0},
  {q:"Cos'è grande come un elefante ma non pesa nulla?",opts:["La sua foto","La sua ombra","Il suo eco","Il suo nome"],a:1},
  {q:"Quanti secondi ci sono in un anno?",opts:["Circa 31 milioni","Circa 315 milioni","Esattamente 3.153.600","Circa 3,15 milioni"],a:0},
  {q:"Se ci sono 3 candele accese e ne soffio 2, quante rimangono?",opts:["1","3","2","0"],a:1},
  {q:"Cosa si trova sempre alla fine di ogni arcobaleno?",opts:["Il tesoro","La lettera O","Il blu","Le nuvole"],a:1},
  {q:"Un uomo spinge la sua auto fino all'hotel. Appena arriva, sa che è in bancarotta. Perché?",opts:["L'auto si è rotta","Stava giocando a Monopoly","Ha finito la benzina","Ha perso il portafoglio"],a:1},
  {q:"Qual è la cosa che più aumenta quando è condivisa?",opts:["Il cibo","La felicità","I soldi","Il segreto"],a:1},
  {q:"Come si chiama il figlio di un uomo che non ha fratelli, il cui padre è figlio del mio padre?",opts:["Mio nipote","Mio figlio","Il mio cousin","Mio fratello"],a:1},
  {q:"Cosa è sempre davanti a te ma non puoi vederlo?",opts:["Il futuro","Il naso","Il passato","La mente"],a:0},
  {q:"Cosa si rompe ogni volta che lo pronunci?",opts:["Il silenzio","Il segreto","La parola","Il voto"],a:0},
  {q:"Se una macchina va a 60 km/h, in mezz'ora quanti km percorre?",opts:["15","30","45","60"],a:1},
  {q:"Qual è la metà di 8?",opts:["3","4","5","0"],a:1},
  {q:"Cosa ha 13 cuori ma non ha un corpo?",opts:["Un libro","Un mazzo di carte","Un essere immaginario","Un castello"],a:1},
  {q:"Un uomo cammina 2 km a nord, poi 2 km a est, poi 2 km a sud. Quanto dista dal punto di partenza?",opts:["0 km","2 km","4 km","6 km"],a:1},
  {q:"Quante volte appare la lettera F nella frase 'FINISHED FILES ARE THE RESULT OF YEARS OF SCIENTIFIC STUDY'?",opts:["3","4","5","6"],a:3},
  {q:"Cosa pesa di più: un chilo di ferro o un chilo di legno?",opts:["Il ferro","Il legno","Pesano uguale","Dipende dal tipo"],a:2},
  {q:"Dove va un uomo quando è nel mezzo del mare?",opts:["In pericolo","Sulla barca","Alla lettera M","In difficoltà"],a:2},
  {q:"Cosa puoi fare che non potrai mai raccontare dopo?",opts:["Un segreto","Dormire","Morire","Sognare"],a:2},
  {q:"In quante parti puoi tagliare una pizza con 3 tagli dritti al massimo?",opts:["5","6","7","8"],a:2},
  {q:"Qual è il numero più grande che puoi scrivere con 4 cifre senza ripetizioni?",opts:["9999","9876","9000","9999"],a:1},
  {q:"Cosa diventa rossa quando la riscaldi?",opts:["La bistecca","Il ferro","La carta","L'acqua"],a:1},
  {q:"Un contadino ha 3 figli e ogni figlio ha 2 sorelle. Quanti figli ha il contadino?",opts:["9","5","3","6"],a:2},
  {q:"Se ci sono 10 uccelli su un filo e ne sparo uno, quanti rimangono?",opts:["9","10","0","Dipende"],a:2},
  {q:"Cosa cresce senza avere radici e muore senza essere vivo?",opts:["Una fiamma","Un cristallo","Il ghiaccio","La schiuma"],a:0},
  {q:"Un uomo ha un gallo che fa le uova. Se fa 3 uova a settimana, quante ne fa in un mese?",opts:["12","0","8","4"],a:1},
  {q:"Quale numero è uguale al quadrato della sua metà?",opts:["1","4","9","16"],a:1},
  {q:"Cosa diventa più piccola quando la aggiungi alle cose grandi?",opts:["La sabbia","Il vuoto","La luce","Il peso"],a:1},
  {q:"Quale stato americano ha un nome di 4 lettere?",opts:["Ohio","Utah","Iowa","Tutti e tre"],a:3},
  {q:"In un aereo ci sono 50 passeggeri. All'atterraggio ne scendono 20. Quanti rimangono?",opts:["30","50","0","20"],a:0},
  {q:"Cosa succede se incroci uno snowman e un vampiro?",opts:["Un mostro del freddo","Congelato","Frostbite","Una gelata"],a:2},
  {q:"Quale è la cosa che non si vede ma fa paura?",opts:["Il buio","Il futuro","Il passato","Un fantasma"],a:0},
  {q:"Se una gallina e mezza fa un uovo e mezzo in un giorno e mezzo, quante uova fa una gallina in un giorno?",opts:["1","2","0,5","1,5"],a:0},
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
  {q:"Chi è il padre dell'Impressionismo?",opts:["Monet","Manet","Renoir","Degas"],a:1},
  {q:"Chi ha dipinto 'Ragazza con l'orecchino di perla'?",opts:["Rembrandt","Vermeer","Rubens","Hals"],a:1},
  {q:"Chi ha dipinto 'La Libertà guida il Popolo'?",opts:["Géricault","Ingres","Delacroix","David"],a:2},
  {q:"Quale pittore olandese del '600 è famoso per i chiaroscuri?",opts:["Vermeer","Hals","Rembrandt","Steen"],a:2},
  {q:"In quale museo si trova il David di Michelangelo?",opts:["Prado","Accademia Firenze","Louvre","Vaticani"],a:1},
  {q:"Chi ha dipinto 'L'Urlo'?",opts:["Ensor","Kubin","Munch","Schiele"],a:2},
  {q:"Chi ha inventato il Cubismo?",opts:["Matisse","Picasso e Braque","Kandinsky","Klee"],a:1},
  {q:"Chi ha dipinto 'Autoritratto con orecchio bendato'?",opts:["Gauguin","Van Gogh","Cézanne","Toulouse-Lautrec"],a:1},
  {q:"Chi ha dipinto 'American Gothic'?",opts:["Hopper","Wood","Wyeth","Rockwell"],a:1},
  {q:"In quale museo si trova 'La Notte Stellata'?",opts:["Louvre","Prado","MoMA New York","Tate Modern"],a:2},
  {q:"Dove si trova la Venere di Milo?",opts:["British Museum","Louvre","Ermitage","Vaticani"],a:1},
  {q:"Quale pittore belga è famoso per 'Ceci n'est pas une pipe'?",opts:["Ensor","Delvaux","Magritte","Wouters"],a:2},
  {q:"Quale artista è famosa per le installazioni di pois?",opts:["Bourgeois","Kusama","Hirst","Sherman"],a:1},
  {q:"Chi ha scolpito 'L'Estasi di Santa Teresa'?",opts:["Canova","Rodin","Bernini","Donatello"],a:2},
  {q:"Chi ha realizzato le porte del Battistero di Firenze?",opts:["Donatello","Brunelleschi","Ghiberti","Verrocchio"],a:2},
  {q:"Chi ha dipinto 'La persistenza della memoria'?",opts:["Magritte","Dalí","Ernst","De Chirico"],a:1},
  {q:"Quale pittore russo fondò il Suprematismo?",opts:["Kandinsky","Malevich","Rodchenko","Tatlin"],a:1},
  {q:"Chi ha dipinto 'Il quarto stato'?",opts:["Segantini","Previati","Pellizza da Volpedo","Morbelli"],a:2},
  {q:"Cosa è l'acquerello?",opts:["Pittura ad olio su carta","Pittura a tempera","Pittura diluita in acqua","Pittura a fresco"],a:2},
  {q:"Chi ha dipinto 'La donna con ombrello'?",opts:["Renoir","Degas","Monet","Manet"],a:2},
  {q:"Quale corrente usa colori puri e violenti?",opts:["Impressionismo","Fauvismo","Puntinismo","Realismo"],a:1},
  {q:"Chi è il più famoso esponente del Barocco italiano?",opts:["Annibale Carracci","Caravaggio","Reni","Borromini"],a:1},
  {q:"Dove si trova la 'Pietà Rondanini' di Michelangelo?",opts:["Firenze","Roma","Milano","Vaticano"],a:2},
  {q:"Chi ha dipinto 'La Cena in Emmaus'?",opts:["Tiziano","Caravaggio","Tintoretto","Veronese"],a:1},
  {q:"Quale pittore spagnolo è famoso per 'Las Meninas'?",opts:["Goya","El Greco","Velázquez","Murillo"],a:2},
  {q:"Chi ha dipinto 'I Bagnanti' (Les Grandes Baigneuses)?",opts:["Renoir","Cézanne","Monet","Seurat"],a:1},
  {q:"Chi ha fondato l'architettura rinascimentale?",opts:["Alberti","Bramante","Brunelleschi","Michelozzo"],a:2},
  {q:"Quale stile architettonico usa archi a ogiva?",opts:["Romanico","Rinascimentale","Gotico","Barocco"],a:2},
  {q:"Chi ha dipinto 'Bacco e Arianna'?",opts:["Raffaello","Tiziano","Veronese","Tintoretto"],a:1},
  {q:"Cosa studia l'iconografia nell'arte?",opts:["Le tecniche pittoriche","Il significato delle immagini","La storia degli artisti","Il mercato dell'arte"],a:1},
  {q:"Chi ha dipinto il soffitto della Sala delle Nozze di Cana a Venezia?",opts:["Tintoretto","Tiziano","Veronese","Bellini"],a:2},
  {q:"Chi ha creato la scultura 'Venere di Willendorf'?",opts:["Ignoto artista paleolitico","Prassitele","Fidia","Lisippo"],a:0},
  {q:"Quale è la tecnica di pittura murale con colori su intonaco umido?",opts:["Tempera","Affresco","Encausto","Gouache"],a:1},
  {q:"Chi ha dipinto 'La Flagellazione di Cristo'?",opts:["Piero della Francesca","Signorelli","Melozzo","Perugino"],a:0},
  {q:"Dove si trova il Museo del Prado?",opts:["Barcellona","Siviglia","Valencia","Madrid"],a:3},
  {q:"Chi ha dipinto 'I Girasoli'?",opts:["Monet","Gauguin","Van Gogh","Seurat"],a:2},
  {q:"Qual è il periodo dell'arte rinascimentale italiana?",opts:["XII-XIII sec.","XIV-XVI sec.","XVII-XVIII sec.","XIX sec."],a:1},
  {q:"Chi ha dipinto 'La Tempesta'?",opts:["Tiziano","Giorgione","Bellini","Palma il Vecchio"],a:1},
  {q:"In quale città si trova il Museo Guggenheim più famoso d'Europa?",opts:["Parigi","Londra","Bilbao","Amsterdam"],a:2},
  {q:"Chi ha creato l'installazione 'The Physical Impossibility of Death in the Mind of Someone Living'?",opts:["Banksy","Damien Hirst","Tracy Emin","Jeff Koons"],a:1},
  {q:"Quale è il metodo di stampa inventato da Gutenberg?",opts:["Calcografia","Litografia","Tipografia a caratteri mobili","Serigrafia"],a:2},
  {q:"Chi ha dipinto 'Ofelia'?",opts:["Millais","Rossetti","Hunt","Burne-Jones"],a:0},
  {q:"Quale movimento artistico è nato a Parigi nella seconda metà dell'800?",opts:["Romanticismo","Impressionismo","Neoclassicismo","Realismo"],a:1},
  {q:"Chi ha dipinto 'La ronde de nuit' (Ronda di notte)?",opts:["Vermeer","Frans Hals","Rembrandt","Jan Steen"],a:2},
  {q:"Chi è il pittore della 'Grande Odalisca'?",opts:["David","Géricault","Ingres","Delacroix"],a:2},
  {q:"Dove si trova la 'La Gioconda'?",opts:["Louvre","Ermitage","Prado","Uffizi"],a:0},
  {q:"Chi ha realizzato il 'Discobolo'?",opts:["Fidia","Prassitele","Mirone","Lisippo"],a:2},
  {q:"Quale è la scultura più famosa di Canova?",opts:["Perseo","Amore e Psiche","Napoleone","Le tre Grazie"],a:3},
  {q:"Chi ha dipinto 'La danza'?",opts:["Matisse","Derain","Vlaminck","Dufy"],a:0},
  {q:"Quale è la tecnica usata da Seurat?",opts:["Impressionismo","Puntinismo","Espressionismo","Fauvismo"],a:1},
  {q:"Chi ha dipinto 'Olympia'?",opts:["Renoir","Degas","Manet","Monet"],a:2},
  {q:"Dove si trova la 'Guernica' di Picasso?",opts:["Louvre","Prado","MoMA","Reina Sofia"],a:3},
  {q:"Chi ha scolpito il Laocoonte?",opts:["Fidia","Prassitele","Agesandro e colleghi","Lisippo"],a:2},
  {q:"Quale è l'opera più famosa di Michelangelo alla Galleria dell'Accademia?",opts:["La Pietà","Il David","Il Prigione","Il Mosè"],a:1},
  {q:"Chi ha fondato il movimento Dadaismo?",opts:["Picasso","Marcel Duchamp","Tristan Tzara","Hugo Ball"],a:2},
  {q:"Quale tecnica usava Pollock per dipingere?",opts:["Pittura a olio tradizionale","Dripping (colature)","Acquerello","Tempera"],a:1},
  {q:"Chi ha realizzato 'La Fontana' (orinatoio capovolto)?",opts:["Warhol","Duchamp","Dali","Picasso"],a:1},
  {q:"Dove si trova la Tate Modern?",opts:["New York","Parigi","Londra","Berlino"],a:2},
  {q:"Chi ha dipinto 'Il giardino delle delizie terrestri'?",opts:["Bosch","Bruegel","Dürer","Cranach"],a:0},
  {q:"In quale anno è nata la fotografia (Daguerrotipo)?",opts:["1820","1826","1839","1851"],a:2},
  {q:"Chi ha dipinto 'La persistenza della memoria' con gli orologi molli?",opts:["Magritte","Ernst","De Chirico","Dalí"],a:3},
  {q:"Qual è il museo più visitato al mondo?",opts:["British Museum","Louvre","Metropolitan","Vaticani"],a:1},
  {q:"Chi ha creato 'Il Bacio' in bronzo?",opts:["Canova","Rodin","Brancusi","Giacometti"],a:1},
  {q:"Dove si trova il MOMA?",opts:["Los Angeles","Chicago","New York","Washington"],a:2},
  {q:"Chi ha dipinto 'Le demoiselles d'Avignon'?",opts:["Braque","Léger","Picasso","Gris"],a:2},
  {q:"Quale è il metodo di stampa che usa pietra calcarea?",opts:["Calcografia","Litografia","Serigrafia","Xilografia"],a:1},
  {q:"Chi ha creato il Movimento Arts and Crafts?",opts:["Ruskin","Morris","Pugin","Eastlake"],a:1},
  {q:"Chi ha dipinto 'La serata delle rane'?",opts:["Monet","Renoir","Pissarro","Sisley"],a:1},
  {q:"Quale è la corrente artistica nata in reazione alla Prima Guerra Mondiale?",opts:["Futurismo","Dadaismo","Surrealismo","Espressionismo"],a:1},
  {q:"Chi ha dipinto 'La vergine delle rocce'?",opts:["Raffaello","Michelangelo","Leonardo","Botticelli"],a:2},
  {q:"In quale museo si trova 'La notte stellata' di Van Gogh?",opts:["Louvre","Prado","MoMA","Metropolitan"],a:2},
  {q:"Chi ha dipinto 'Il pranzo dei canottieri'?",opts:["Monet","Manet","Renoir","Degas"],a:2},
  {q:"Chi ha dipinto la serie 'Notte blu' e 'Giallo, rosso, blu'?",opts:["Mondrian","Kandinsky","Klee","Miro"],a:1},
  {q:"Quale è il nome completo di Leonardo da Vinci?",opts:["Leonardo di ser Piero da Vinci","Leonardo di Antonio da Vinci","Leonardo di Francesco da Vinci","Leonardo Vinci"],a:0},
  {q:"In quale stile è costruita la Cattedrale di Notre-Dame?",opts:["Romanico","Gotico","Barocco","Rinascimentale"],a:1},
  {q:"Chi ha progettato il Guggenheim di New York?",opts:["Mies van der Rohe","Le Corbusier","Frank Lloyd Wright","Philip Johnson"],a:2},
  {q:"Chi ha dipinto 'La scuola di Atene'?",opts:["Michelangelo","Leonardo","Raffaello","Perugino"],a:2},
  {q:"Quale è il periodo dell'arte gotica?",opts:["V-VIII sec.","X-XII sec.","XII-XV sec.","XVI-XVII sec."],a:2},
  {q:"Chi ha dipinto 'L'origine del mondo'?",opts:["Manet","Courbet","Ingres","Géricault"],a:1},
  {q:"In quale anno Picasso ha dipinto Guernica?",opts:["1935","1937","1939","1941"],a:1},
  {q:"Chi ha scolpito la 'Nike di Samotracia'?",opts:["Prassitele","Fidia","Pittios di Rodi (attr.)","Lisippo"],a:2},
  {q:"Dove si trova la Nike di Samotracia?",opts:["British Museum","Louvre","Ermitage","Vaticani"],a:1},
  {q:"Quale è il soggetto principale dell'arte minimalista?",opts:["Natura","Forma pura e geometrica","Corpo umano","Paesaggio"],a:1},
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
  {q:"Quale è il solo mammifero a deporre uova?",opts:["Koala","Ornitorinco","Echidna","Ornitorinco ed Echidna"],a:3},
  {q:"Quale animale usa l'ecolocalizzazione?",opts:["Pipistrello","Delfino","Entrambi","Nessuno"],a:2},
  {q:"Quale animale ha la gestazione più lunga?",opts:["Balena","Giraffa","Elefante","Ippopotamo"],a:2},
  {q:"Qual è la velocità massima del ghepardo?",opts:["80 km/h","100 km/h","120 km/h","140 km/h"],a:2},
  {q:"Quante specie di pinguini esistono circa?",opts:["8","12","18","25"],a:2},
  {q:"Qual è il rettile più lungo del mondo?",opts:["Pitone reticolato","Anaconda","Cobra reale","Coccodrillo marino"],a:0},
  {q:"Quale animale ha il sangue blu?",opts:["Polpo","Granchio ferro di cavallo","Entrambi","Nessuno"],a:2},
  {q:"Quale è il rapace più grande del mondo?",opts:["Aquila reale","Condor delle Ande","Arpia","Aquila di Haast"],a:1},
  {q:"Quante zampe ha un granchio?",opts:["6","8","10","12"],a:2},
  {q:"Dove vive l'axolotl in natura?",opts:["Amazzonia","Lago Xochimilco Messico","Pantanal","Florida"],a:1},
  {q:"Quale è il mammifero marino più intelligente?",opts:["Balena megattera","Delfino comune","Orca","Beluga"],a:1},
  {q:"Quante specie di delfini esistono circa?",opts:["20","30","40","90"],a:3},
  {q:"Quale è l'insetto più veloce in volo?",opts:["Libellula","Mosca tafano","Farfalla monarca","Vespa"],a:0},
  {q:"Quale animale ha la lingua più lunga rispetto al corpo?",opts:["Camaleonte","Rana","Armadillo","Ornitorinco"],a:0},
  {q:"Quante anni può vivere una tartaruga Galapagos?",opts:["50","100","150","200+"],a:3},
  {q:"Quale è il più piccolo uccello del mondo?",opts:["Colibrì ape","Passero nano","Occhio di bue","Cisticola"],a:0},
  {q:"Quale è l'animale con il battito cardiaco più lento?",opts:["Elefante","Balena blu","Ippopotamo","Orso in letargo"],a:1},
  {q:"Quante specie di formiche esistono circa?",opts:["5.000","10.000","20.000","50.000"],a:2},
  {q:"Dove vive il tucano?",opts:["Africa","Australia","America del Sud","Asia"],a:2},
  {q:"Quale animale può rigenerare gli arti?",opts:["Salamandra","Axolotl","Geco","Tutti e tre"],a:3},
  {q:"Quale è la specie di coccodrillo più grande?",opts:["Coccodrillo del Nilo","Coccodrillo marino","Alligatore americano","Gharial"],a:1},
  {q:"Qual è l'uccello con l'apertura alare maggiore?",opts:["Condor delle Ande","Albatro di Amsterdam","Albatro urlante","Pellicano dalmata"],a:2},
  {q:"Da dove proviene il guanaco?",opts:["Africa","Asia","America del Nord","America del Sud"],a:3},
  {q:"Quante occhi ha una mosca comune?",opts:["2 semplici","2 composti","2 composti + 3 semplici","Solo 2"],a:2},
  {q:"Qual è il colore del sangue degli insetti?",opts:["Rosso","Blu","Verde/giallo","Trasparente"],a:2},
  {q:"Quante corna ha il rinoceronte di Sumatra?",opts:["1","2","3","Nessuna"],a:1},
  {q:"Quale è l'animale più longevo conosciuto?",opts:["Tartaruga di Aldabra","Quahog (Arctica islandica)","Medusa immortale (Turritopsis)","Idra"],a:2},
  {q:"Quale animale ha il suono più potente?",opts:["Balena megattera","Balena blu","Elefante","Scimpanzé"],a:1},
  {q:"Quale uccello costruisce il nido più elaborato?",opts:["Aquila","Tessitore","Corvo","Cicogna"],a:1},
  {q:"Quale è il mammifero che nuota più veloce?",opts:["Delfino","Orca","Foca leopardo","Tricheco"],a:1},
  {q:"Quale è la farfalla più grande del mondo?",opts:["Monarca","Attacus Atlas","Alexandra Birdwing","Morpho"],a:2},
  {q:"Quale animale ha la lingua più lunga in assoluto?",opts:["Formichiere gigante","Camaleonte","Rana toro","Pangolino"],a:0},
  {q:"Dove vive l'ornitorinco?",opts:["Nuova Zelanda","Australia","Papua","Isole Salomone"],a:1},
  {q:"Quante specie di uccelli esistono circa?",opts:["5.000","8.000","10.000","18.000"],a:2},
  {q:"Qual è il colore visto dalle api ma non dagli umani?",opts:["Infrarosso","Ultravioletto","Verde intenso","Viola scuro"],a:1},
  {q:"Quale animale usa il veleno più letale tra i serpenti?",opts:["Cobra reale","Mamba nero","Taipan interno","Serpente a sonagli"],a:2},
  {q:"Quanti tentacoli ha un calamaro comune?",opts:["8","10","12","6"],a:1},
  {q:"Qual è il più piccolo mammifero del mondo?",opts:["Toporagno etrusco","Mustiolo","Chirottero del Kitti","Topo nano"],a:2},
  {q:"Quale è la lucertola più grande del mondo?",opts:["Iguana verde","Varano di Komodo","Monitor del Nilo","Varano gigante"],a:1},
  {q:"Quante specie di squali esistono circa?",opts:["100","200","300","500"],a:3},
  {q:"Quale è il serpente più lungo del mondo?",opts:["Boa constrictor","Anaconda verde","Pitone reticolato","Pitone birmano"],a:2},
  {q:"Dove vive il rinoceronte di Giava?",opts:["Africa","India","Indonesia","Vietnam"],a:2},
  {q:"Qual è il colore naturale del pellicano?",opts:["Solo bianco","Solo rosa","Bianco o rosato","Grigio"],a:2},
  {q:"Quanti kg pesa mediamente un elefante africano maschio adulto?",opts:["2.000 kg","4.000 kg","6.000 kg","8.000 kg"],a:2},
  {q:"Quale animale ha il cervello più grande rispetto al corpo?",opts:["Delfino","Scimpanzé","Umano","Scoiattolo"],a:2},
  {q:"Dove vive il pinguino africano (o del Capo)?",opts:["Antartide","Sudafrica","Argentina","Australia"],a:1},
  {q:"Quale è il colore dell'ippopotamo sotto l'acqua?",opts:["Marrone","Grigio","Rosa","Viola"],a:2},
  {q:"Quanti anni vive mediamente un gorilla in natura?",opts:["20-25","30-35","35-40","40-45"],a:2},
  {q:"Quale è il felino più pesante del mondo?",opts:["Leone","Tigre","Giaguaro","Leopardo"],a:1},
  {q:"Quante specie di panda esistono?",opts:["1","2","3","4"],a:1},
  {q:"Quale è il coleottero più grande del mondo?",opts:["Cervo volante","Scarabeo ercole","Titan cerambycidae","Goliath beetle"],a:2},
  {q:"Dove vive il lemure indri?",opts:["Africa","Madagascar","India","Indonesia"],a:1},
  {q:"Quante corna ha il rinoceronte bianco?",opts:["1","2","3","Nessuna"],a:1},
  {q:"Quale è l'uccello che vola più in alto?",opts:["Aquila reale","Avvoltoio di Rüppell","Condor delle Ande","Cicogna bianca"],a:1},
  {q:"Qual è il suono prodotto dal leone?",opts:["Ruggito","Ringhio","Sibilo","Ululo"],a:0},
  {q:"Quante specie di pangolini esistono?",opts:["4","6","8","10"],a:2},
  {q:"Dove vive il capibara?",opts:["Africa","Asia","America del Sud","Australia"],a:2},
  {q:"Quale è il mollusco più grande del mondo?",opts:["Polpo gigante","Calamaro gigante","Nautilus","Chiocciola gigante"],a:1},
  {q:"Quante specie di pinguini vivono fuori dall'Antartide?",opts:["2","5","10","Nessuna"],a:2},
  {q:"Quale è l'animale con il naso più lungo?",opts:["Elefante","Proboscide di tapiro","Scimmia proboscide","Narvalo"],a:0},
  {q:"Dove vive il leopardo delle nevi?",opts:["Africa","Himalaya e Asia Centrale","Nordamerica","Siberia"],a:1},
  {q:"Quante zampe ha uno scorpione?",opts:["6","8","10","12"],a:1},
  {q:"Quale è il pesce che nuota più velocemente?",opts:["Pesce vela","Tonno rosso","Marlin blu","Mako"],a:0},
  {q:"Qual è l'animale con più denti?",opts:["Squalo bianco","Lumaca (gasteropode)","Coccodrillo","Orca"],a:1},
  {q:"Dove vive il tapiro di Baird?",opts:["Sudamerica","Africa","Asia Sud-Est","America Centrale"],a:3},
  {q:"Quante specie di tartarughe marine esistono?",opts:["5","7","9","11"],a:1},
  {q:"Quale è il colore originale della volpe artica in estate?",opts:["Bianco","Grigio-marrone","Blu-grigio","Rosso"],a:1},
  {q:"Quante specie di pipistrelli esistono circa?",opts:["500","1.000","1.400","2.000"],a:2},
  {q:"Quale animale produce il suono chiamato 'raglio'?",opts:["Asino","Cavallo","Mulo","Zebra"],a:0},
  {q:"Quale è il rettile più veloce?",opts:["Iguana spinosa","Varano di Komodo","Sphenodon","Geco"],a:0},
  {q:"Quante specie di elefanti esistono?",opts:["1","2","3","4"],a:2},
  {q:"Dove vive la salamandra di fuoco?",opts:["America del Nord","Europa","Asia","Australia"],a:1},
  {q:"Quale è il mammifero con le orecchie più grandi rispetto al corpo?",opts:["Elefante africano","Fennec","Pipistrello orecchione","Lepre artica"],a:1},
  {q:"Quante coppie di ali ha una farfalla?",opts:["1","2","3","4"],a:1},
  {q:"Quale è il colore del latte di ippopotamo?",opts:["Bianco","Rosa","Giallo","Rosso"],a:1},
  {q:"Dove vive il capricorno delle Alpi?",opts:["Pirenei","Alpi e Appenino","Solo in Svizzera","Caucaso"],a:1},
  {q:"Quale è il serpente più velenoso del mondo?",opts:["Taipan interno","Mamba nero","Serpente corallo","Cobra reale"],a:0},
  {q:"Quante specie di orsi esistono?",opts:["6","8","10","12"],a:1},
  {q:"Quale è il mammifero con il periodo di gestazione più lungo?",opts:["Elefante (22 mesi)","Rinoceronte (18 mesi)","Balena (12 mesi)","Giraffa (15 mesi)"],a:0},
  {q:"Dove vive il caracal?",opts:["Africa e Asia Meridionale","Solo Africa","Solo Asia","America"],a:0},
  {q:"Quale è la principale fonte di cibo del panda gigante?",opts:["Bambù","Frutta","Insetti","Pesci"],a:0},
  {q:"Quante specie di aquile esistono circa?",opts:["30","60","90","120"],a:1},
  {q:"Quale è il colore dell'occhio di un gatto nel buio?",opts:["Verde","Arancione","Riflette la luce (tapetum lucidum)","Rosso"],a:2},
  {q:"Dove vive il lemure nanetto?",opts:["Africa","Madagascar","India","Indonesia"],a:1},
  {q:"Quale animale produce il suono chiamato 'bramito'?",opts:["Cervo","Bisonte","Alce","Bison"],a:0},
  {q:"Quante zampe ha un centopiedi?",opts:["100 esatte","Da 30 a 354 (sempre pari)","Sempre 50","Esattamente 44"],a:1},
];
// ── MATEMATICA & NUMERI ──────────────────────────────────────────────────────
const QUESTIONS_MATEMATICA = [
  // Aritmetica base
  {q:"Quanto fa 15 × 15?",opts:["175","205","225","215"],a:2},
  {q:"Quanto fa 144 ÷ 12?",opts:["10","11","12","13"],a:2},
  {q:"Qual è il quadrato di 13?",opts:["159","169","179","189"],a:1},
  {q:"Quanto fa 2 elevato alla decima potenza?",opts:["512","1024","2048","256"],a:1},
  {q:"Qual è la radice quadrata di 196?",opts:["12","13","14","15"],a:2},
  {q:"Quanto fa 17 × 8?",opts:["126","132","136","146"],a:2},
  {q:"Qual è il risultato di 1000 ÷ 8?",opts:["105","115","125","135"],a:2},
  {q:"Quanto fa 25²?",opts:["525","575","625","675"],a:2},
  {q:"Quanto fa 3 × 3 × 3 × 3?",opts:["27","54","81","108"],a:2},
  {q:"Qual è la radice quadrata di 289?",opts:["15","16","17","18"],a:2},
  // Frazioni e percentuali
  {q:"Quanto è il 20% di 250?",opts:["40","45","50","55"],a:2},
  {q:"Quanto è il 15% di 200?",opts:["25","30","35","40"],a:1},
  {q:"Quanto è il 30% di 90?",opts:["21","24","27","30"],a:2},
  {q:"Qual è ¾ di 120?",opts:["80","85","90","95"],a:2},
  {q:"Quanto è il 40% di 75?",opts:["25","28","30","35"],a:2},
  {q:"Se un articolo costa 80€ con il 25% di sconto, quanto pago?",opts:["55€","60€","65€","70€"],a:1},
  {q:"Quanto è 1/3 di 99?",opts:["31","33","35","37"],a:1},
  {q:"Se guadagno 1200€ e spendo il 60%, quanto risparmio?",opts:["360€","420€","480€","540€"],a:2},
  {q:"Quanto è il 5% di 340?",opts:["14","15","16","17"],a:3},
  {q:"Se un prodotto passa da 50€ a 65€, di che percentuale è aumentato?",opts:["15%","25%","30%","35%"],a:2},
  // Geometria
  {q:"Quanti gradi ha un triangolo equilatero per ogni angolo?",opts:["45°","60°","72°","90°"],a:1},
  {q:"Qual è la formula dell'area di un cerchio?",opts:["2πr","πr²","πd","2πr²"],a:1},
  {q:"Quanti gradi ha un angolo retto?",opts:["45°","60°","90°","180°"],a:2},
  {q:"Quanti lati ha un pentagono?",opts:["4","5","6","7"],a:1},
  {q:"Qual è il perimetro di un quadrato con lato 7?",opts:["21","28","35","49"],a:1},
  {q:"Qual è l'area di un rettangolo 6×9?",opts:["45","48","54","60"],a:2},
  {q:"Quanti gradi ha un poligono regolare con 6 lati (esagono) in totale?",opts:["540°","600°","720°","900°"],a:2},
  {q:"Se il raggio di un cerchio è 5, quanto è il diametro?",opts:["5","8","10","15"],a:2},
  {q:"Quanti gradi ha un angolo piatto?",opts:["90°","120°","180°","360°"],a:2},
  {q:"Qual è il volume di un cubo con lato 4?",opts:["48","56","64","72"],a:2},
  // Algebra e logica numerica
  {q:"Se x + 7 = 15, quanto vale x?",opts:["6","7","8","9"],a:2},
  {q:"Se 3x = 21, quanto vale x?",opts:["5","6","7","8"],a:2},
  {q:"Qual è il prossimo numero nella serie: 2, 4, 8, 16, ...?",opts:["24","28","30","32"],a:3},
  {q:"Qual è il prossimo numero nella serie: 1, 1, 2, 3, 5, 8, ...?",opts:["11","12","13","14"],a:2},
  {q:"Questa è la serie di Fibonacci. Chi l'ha scoperta?",opts:["Gauss","Fibonacci","Eulero","Pascal"],a:1},
  {q:"Qual è il prossimo numero nella serie: 3, 6, 12, 24, ...?",opts:["36","42","48","52"],a:2},
  {q:"Qual è il prossimo numero nella serie: 100, 91, 82, 73, ...?",opts:["62","63","64","65"],a:2},
  {q:"Se 2x + 4 = 14, quanto vale x?",opts:["3","4","5","6"],a:2},
  {q:"Qual è il prossimo numero nella serie: 1, 4, 9, 16, 25, ...?",opts:["30","32","36","40"],a:2},
  {q:"Se a=2 e b=3, quanto fa a² + b²?",opts:["10","12","13","25"],a:2},
  // Numeri speciali e curiosità
  {q:"Qual è il numero Pi greco approssimato a 2 decimali?",opts:["3.12","3.14","3.16","3.18"],a:1},
  {q:"Qual è il numero di Eulero (e) approssimato?",opts:["2.51","2.61","2.71","2.81"],a:2},
  {q:"Quanti numeri primi ci sono tra 1 e 20?",opts:["6","7","8","9"],a:2},
  {q:"Qual è il numero primo più grande tra questi?",opts:["91","93","97","99"],a:2},
  {q:"Quanto fa la somma degli angoli di un quadrilatero?",opts:["270°","360°","450°","540°"],a:1},
  {q:"Qual è il numero primo più piccolo maggiore di 10?",opts:["11","12","13","14"],a:0},
  {q:"Quanto fa 7! (fattoriale di 7)?",opts:["2.520","5.040","7.560","10.080"],a:1},
  {q:"Qual è la somma dei numeri da 1 a 10?",opts:["45","50","55","60"],a:2},
  {q:"Qual è la somma dei numeri da 1 a 100?",opts:["4.950","5.000","5.050","5.100"],a:2},
  {q:"Quanti zeri ha un milione?",opts:["5","6","7","8"],a:1},
  // Conversioni e misure
  {q:"Quanti cm ci sono in un metro?",opts:["10","100","1000","10000"],a:1},
  {q:"Quanti ml ci sono in un litro?",opts:["10","100","1000","10000"],a:2},
  {q:"Quanti grammi ci sono in un kg?",opts:["10","100","1000","10000"],a:2},
  {q:"Quanti minuti ci sono in 3 ore?",opts:["150","160","170","180"],a:3},
  {q:"Quanti secondi ci sono in 5 minuti?",opts:["250","280","300","360"],a:2},
  {q:"Quanti cm² ci sono in 1 m²?",opts:["100","1.000","10.000","100.000"],a:2},
  {q:"Quante ore ci sono in una settimana?",opts:["148","158","168","178"],a:2},
  {q:"Quanti giorni ci sono in un anno bisestile?",opts:["364","365","366","367"],a:2},
  {q:"Quanti km ci sono in 5.000 metri?",opts:["0,5","5","50","500"],a:1},
  {q:"Quante ore ci sono in 3 giorni?",opts:["60","66","72","78"],a:2},
  // Probabilità e statistica
  {q:"Se lanci un dado, qual è la probabilità di ottenere un 6?",opts:["1/3","1/4","1/5","1/6"],a:3},
  {q:"Se lancio una moneta, qual è la probabilità di testa?",opts:["1/4","1/3","1/2","2/3"],a:2},
  {q:"Qual è la media di 10, 20, 30?",opts:["15","20","25","30"],a:1},
  {q:"Qual è la mediana di 3, 5, 7, 9, 11?",opts:["5","6","7","8"],a:2},
  {q:"Se ho un mazzo di 52 carte, qual è la prob. di pescare un asso?",opts:["1/13","1/12","1/11","1/10"],a:0},
  {q:"Se lancio 2 dadi, qual è la probabilità che la somma sia 7?",opts:["1/6","5/36","6/36","7/36"],a:2},
  {q:"Qual è la moda di: 3, 5, 5, 7, 9, 9, 9, 11?",opts:["5","7","9","11"],a:2},
  {q:"Qual è la media di 15, 25, 35, 45?",opts:["25","28","30","32"],a:2},
  {q:"Se un evento ha probabilità 0,25, quante volte su 100 accade?",opts:["15","20","25","30"],a:2},
  {q:"Quante combinazioni ci sono lanciando 2 monete?",opts:["2","3","4","6"],a:2},
  // Potenze e radici
  {q:"Quanto fa 10³?",opts:["100","300","1.000","10.000"],a:2},
  {q:"Quanto fa 2⁸?",opts:["128","256","512","1024"],a:1},
  {q:"Qual è la radice quadrata di 625?",opts:["20","22","25","30"],a:2},
  {q:"Quanto fa 5³?",opts:["75","100","125","150"],a:2},
  {q:"Qual è la radice quadrata di 1.444?",opts:["36","38","40","42"],a:1},
  {q:"Quanto fa 4⁴?",opts:["64","128","256","512"],a:2},
  {q:"Qual è la radice cubica di 27?",opts:["2","3","4","5"],a:1},
  {q:"Quanto fa 6²?",opts:["12","24","36","48"],a:2},
  {q:"Qual è la radice cubica di 125?",opts:["4","5","6","7"],a:1},
  {q:"Quanto fa 9² + 4²?",opts:["85","95","97","105"],a:2},
  // Divisibilità e numeri interi
  {q:"Un numero è divisibile per 9 se...?",opts:["Finisce per 9","La somma delle cifre è divisibile per 9","È pari","Finisce per 0 o 9"],a:1},
  {q:"Un numero è divisibile per 4 se...?",opts:["È pari","Le ultime 2 cifre sono divisibili per 4","La somma delle cifre è 4","Finisce per 4"],a:1},
  {q:"Qual è il MCD di 12 e 18?",opts:["2","3","6","9"],a:2},
  {q:"Qual è il mcm di 4 e 6?",opts:["8","10","12","24"],a:2},
  {q:"Qual è il MCD di 24 e 36?",opts:["6","8","12","18"],a:2},
  {q:"Qual è il mcm di 5 e 7?",opts:["12","25","35","70"],a:2},
  {q:"Quanti numeri pari ci sono tra 1 e 20?",opts:["8","9","10","11"],a:2},
  {q:"Qual è il numero primo tra questi?",opts:["51","57","59","63"],a:2},
  {q:"La somma di 3 numeri consecutivi è 36. Qual è il numero centrale?",opts:["10","11","12","13"],a:2},
  {q:"Qual è il numero che diviso per 3 dà 17?",opts:["48","51","54","57"],a:1},
  // Sequenze e pattern
  {q:"Qual è il prossimo nella serie: 1, 3, 6, 10, 15, ...?",opts:["18","19","20","21"],a:3},
  {q:"Qual è il prossimo nella serie: 2, 3, 5, 7, 11, 13, ...?",opts:["15","16","17","18"],a:2},
  {q:"Qual è il prossimo nella serie: 0, 1, 3, 6, 10, 15, ...?",opts:["18","19","20","21"],a:3},
  {q:"Qual è il prossimo nella serie: 64, 32, 16, 8, ...?",opts:["2","3","4","6"],a:2},
  {q:"Qual è il prossimo nella serie: 1, 8, 27, 64, ...?",opts:["100","121","125","128"],a:2},
  {q:"Se una sequenza cresce di 7 ogni volta e il primo termine è 3, qual è il 5° termine?",opts:["28","30","31","35"],a:2},
  {q:"Qual è la somma dei primi 5 numeri dispari?",opts:["20","22","25","30"],a:2},
  {q:"Qual è il prossimo nella serie: 2, 6, 12, 20, 30, ...?",opts:["38","40","42","44"],a:2},
  {q:"Qual è il prossimo nella serie: 1, 2, 4, 7, 11, 16, ...?",opts:["20","22","23","25"],a:1},
  {q:"Se moltiplico tutti i numeri da 1 a 5, ottengo?",opts:["100","110","120","130"],a:2},
  // Problemi pratici
  {q:"Se un treno viaggia a 120 km/h, in 2,5 ore quanti km percorre?",opts:["240","280","300","320"],a:2},
  {q:"Se compro 3 kg di mele a 2,50€/kg e 2 kg di pere a 3€/kg, quanto spendo?",opts:["12€","13,50€","14€","15€"],a:1},
  {q:"Se divido 360 persone in gruppi da 15, quanti gruppi ottengo?",opts:["20","22","24","26"],a:2},
  {q:"Se un campo è lungo 80m e largo 50m, quanti m² è grande?",opts:["3.500","4.000","4.500","5.000"],a:1},
  {q:"Se guadagno 45€ all'ora e lavoro 8 ore, quanto guadagno?",opts:["320€","340€","360€","380€"],a:2},
  {q:"Se un orologio è fermo, quante volte al giorno segna l'ora giusta?",opts:["0","1","2","4"],a:2},
  {q:"Se riempio una vasca in 4 ore con un rubinetto, in 6 ore con un altro, insieme in quanto tempo?",opts:["2 h","2,4 h","3 h","3,5 h"],a:1},
  {q:"Se percorro 150 km in 2 ore, qual è la mia velocità media?",opts:["65 km/h","70 km/h","75 km/h","80 km/h"],a:2},
  {q:"Se risparmio il 20% di 1.500€, quanto risparmio in un anno?",opts:["250€","280€","300€","320€"],a:2},
  {q:"Se un prodotto costa 120€ e viene scontato del 35%, quanto pago?",opts:["72€","75€","78€","80€"],a:2},
];
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
  matematica:  'linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 50%,#7c3aed 100%)',
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
  matematica:  { name: 'Matematica 🔢',      emoji: '🔢' },
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
  pickN(QUESTIONS_LOGICA,     1, gu(room,'logica')).forEach(q=>questions.push(tagQ(q,'logica')));
  pickN(QUESTIONS_MATEMATICA, 1, gu(room,'matematica')).forEach(q=>questions.push(tagQ(q,'matematica')));
  pickN(QUESTIONS_ARTE,       1, gu(room,'arte')).forEach(q=>questions.push(tagQ(q,'arte')));
  pickN(QUESTIONS_ANIMALI,    1, gu(room,'animali')).forEach(q=>questions.push(tagQ(q,'animali')));
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
  { id:"leo",    name:"Creamy", role:"L'Avventuriero", color:"#f97316", gender:"m" },
  { id:"rico",   name:"Rico",   role:"Il Cool",        color:"#6366f1", gender:"m" },
  { id:"zack",   name:"Zack",   role:"Il Ribelle",     color:"#84cc16", gender:"m" },
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
