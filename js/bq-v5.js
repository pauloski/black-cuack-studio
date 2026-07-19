/* ============================================================
   BLACKQUACK — shared site script (multi-page)
   Loads products from products.json (fallback embedded for file://),
   injects nav/footer/cart/modal, renders PLP + PDP, cart (localStorage).
   ============================================================ */

/* ---------- PRODUCT DATA (fallback = snapshot of products.json) ---------- */
const RAW_FALLBACK = [
  {
    "ID": "BQ-001",
    "Categoria": "Herramientas",
    "product_title": "Tablero de Luz LED Slim A4",
    "descripción": "Mesa de luz LED ultra delgada con tres niveles de intensidad táctil. Diseñada para calcar, animar y perfeccionar tus secuencias paso a paso de forma cómoda.",
    "size": ["A5", "A4", "A3"],
    "stock": 45,
    "precio": 15990,
    "image_url": "https://dummyimage.com/600x600/444444/f39200.png&text=Tablero+LED+Slim",
    "image_views": [
      "https://dummyimage.com/600x600/444444/dec520.png&text=Mesa+Encendida",
      "https://dummyimage.com/600x600/444444/e6e6e6.png&text=Perfil+Ultra+Delgado"
    ]
  },
  {
    "ID": "BQ-002",
    "Categoria": "Makers",
    "product_title": "Pack 3 Flipbooks BlackQuack",
    "descripción": "Pack de 3 blocks de animación de 11.5cm x 6.5cm. Papel de gramaje de 120gr para el correcto traspaso visual de una página a otra y rigidez suficiente para el paso de hojas bajo la presión del dedo. De 60 hojas y con tornillos Chicago M5x10mm metálicos desmontables para añadir, quitar o reorganizar tus animaciones.",
    "size": "11.5cm x 6.5cm",
    "stock": 120,
    "precio": 11990,
    "image_url": "https://dummyimage.com/600x600/444444/f39200.png&text=Pack+3+Flipbooks",
    "image_views": [
      "https://dummyimage.com/600x600/444444/dec520.png&text=Tornillos+Chicago",
      "https://dummyimage.com/600x600/444444/e6e6e6.png&text=Grosor+Hojas+120g"
    ]
  },
  {
    "ID": "BQ-003",
    "Categoria": "Herramientas",
    "product_title": "Guante de Animación Profesional",
    "descripción": "Guante de lycra elástica de dos dedos. Reduce la fricción de la mano con la mesa de luz o la tablet de dibujo, garantizando un deslizamiento suave y libre de manchas.",
    "size": ["S", "M", "L"],
    "stock": 75,
    "precio": 4990,
    "image_url": "https://dummyimage.com/600x600/444444/f39200.png&text=Guante+de+Animacion",
    "image_views": [
      "https://dummyimage.com/600x600/444444/dec520.png&text=Ajuste+Lycra"
    ]
  },
  {
    "ID": "BQ-004",
    "Categoria": "Herramientas",
    "product_title": "Plastilina Stop Motion Pro",
    "descripción": "Plastilina de alta densidad especialmente formulada para animación de stop motion. Resistente al calor de las lámparas de estudio, no pierde su forma y es altamente maleable.",
    "size": "",
    "stock": 50,
    "precio": 8990,
    "image_url": "https://dummyimage.com/600x600/444444/f39200.png&text=Plastilina+Pro+Stop+Motion",
    "image_views": [
      "https://dummyimage.com/600x600/444444/dec520.png&text=Set+de+Colores"
    ]
  },
  {
    "ID": "BQ-005",
    "Categoria": "Makers",
    "product_title": "Kit Autómatas Mecánicos DIY",
    "descripción": "Piezas de madera pre-cortadas por láser para ensamblar tus propios autómatas. Experimenta mecánicas sencillas que cobran vida de forma análoga.",
    "size": "",
    "stock": 30,
    "precio": 14990,
    "image_url": "https://dummyimage.com/600x600/444444/f39200.png&text=Kit+Automata+DIY",
    "image_views": [
      "https://dummyimage.com/600x600/444444/dec520.png&text=Corte+Laser+Detalle"
    ]
  },
  {
    "ID": "BQ-006",
    "Categoria": "Makers",
    "product_title": "Zootropo Didáctico Classic",
    "descripción": "Juguete óptico clásico que permite comprender los fundamentos de la persistencia retiniana. Incluye bandas ilustradas de animación y tiras en blanco para tus dibujos.",
    "size": "",
    "stock": 40,
    "precio": 12990,
    "image_url": "https://dummyimage.com/600x600/444444/f39200.png&text=Zootropo+Didactico",
    "image_views": [
      "https://dummyimage.com/600x600/444444/dec520.png&text=Tiras+de+Animacion"
    ]
  },
  {
    "ID": "BQ-007",
    "Categoria": "Makers",
    "product_title": "Mechanical Flipbook Machine",
    "descripción": "Dispositivo cinético con engranajes y manivela diseñado para montar tus flipbooks y pasarlos de manera continua. El cruce perfecto entre arte e ingeniería de escritorio.",
    "size": "",
    "stock": 20,
    "precio": 24990,
    "image_url": "https://dummyimage.com/600x600/444444/f39200.png&text=Flipbook+Machine",
    "image_views": [
      "https://dummyimage.com/600x600/444444/dec520.png&text=Mecanismo+Interno"
    ]
  },
  {
    "ID": "BQ-008",
    "Categoria": "Merchandising",
    "product_title": "Polerón BlackQuack Hoodie",
    "descripción": "Polerón con capucha premium de algodón pesado. Comodidad brutalista y diseño de marca 'Make Some Quack' para el estudio diario.",
    "size": ["S", "M", "L", "XL"],
    "stock": 60,
    "precio": 29990,
    "image_url": "https://dummyimage.com/600x600/444444/f39200.png&text=Poleron+BlackQuack",
    "image_views": [
      "https://dummyimage.com/600x600/444444/dec520.png&text=Bordado+Espalda"
    ]
  },
  {
    "ID": "BQ-009",
    "Categoria": "Art",
    "product_title": "Cuadro Ilustración Oficial BlackQuack Team",
    "descripción": "Impresión digital giclée sobre papel Fine Art. Una vista divertida e ilustrada del equipo trabajando en sus historias locas de animación.",
    "size": ["30x40cm", "50x70cm"],
    "stock": 15,
    "precio": 18990,
    "image_url": "https://dummyimage.com/600x600/444444/f39200.png&text=Cuadro+Oficial+BQ",
    "image_views": [
      "https://dummyimage.com/600x600/444444/dec520.png&text=Detalle+Impresion"
    ]
  },
  {
    "ID": "BQ-010",
    "Categoria": "Art",
    "product_title": "Ilustración Coleccionable - 'El Escape del Pato'",
    "descripción": "Lámina impresa oficial. Ilustración de autor que plasma la esencia de la rebeldía creativa de la marca.",
    "size": ["A4", "A3"],
    "stock": 30,
    "precio": 9990,
    "image_url": "https://dummyimage.com/600x600/444444/f39200.png&text=Ilustracion+Escape+Pato",
    "image_views": []
  },
  {
    "ID": "BQ-011",
    "Categoria": "Art",
    "product_title": "Ilustración Coleccionable - 'Mesa de Luz Caótica'",
    "descripción": "Lámina impresa oficial. Vista conceptual que celebra el hermoso desorden que surge al animar en el estudio.",
    "size": ["A4", "A3"],
    "stock": 30,
    "precio": 9990,
    "image_url": "https://dummyimage.com/600x600/444444/f39200.png&text=Ilustracion+Mesa+Caotica",
    "image_views": []
  },
  {
    "ID": "BQ-012",
    "Categoria": "Art",
    "product_title": "Ilustración Coleccionable - 'Storyboard Retro'",
    "descripción": "Lámina impresa oficial. Una mirada retrospectiva a los primeros bosquejos de producción de BlackQuack.",
    "size": ["A4", "A3"],
    "stock": 30,
    "precio": 9990,
    "image_url": "https://dummyimage.com/600x600/444444/f39200.png&text=Ilustracion+Storyboard+Retro",
    "image_views": []
  },
  {
    "ID": "BQ-013",
    "Categoria": "Merchandising",
    "product_title": "Tazón Matte 'Make Some Quack'",
    "descripción": "Tazón cerámico negro mate con grabado de alta resolución. Tu compañero oficial para tazas de café eternas en sesiones de stop motion.",
    "size": "",
    "stock": 100,
    "precio": 5990,
    "image_url": "https://dummyimage.com/600x600/444444/f39200.png&text=Tazon+BlackQuack",
    "image_views": [
      "https://dummyimage.com/600x600/444444/dec520.png&text=Grabado+Frontal"
    ]
  },
  {
    "ID": "BQ-014",
    "Categoria": "Herramientas",
    "product_title": "Trípode de Animación Stop Motion Flex",
    "descripción": "Trípode ultra articulado y de alta fricción. Mantiene tu smartphone o tablet inmóvil durante largas capturas de fotogramas.",
    "size": "",
    "stock": 25,
    "precio": 14990,
    "image_url": "https://dummyimage.com/600x600/444444/f39200.png&text=Tripode+Flex+Stop+Motion",
    "image_views": [
      "https://dummyimage.com/600x600/444444/dec520.png&text=Soporte+Ajustable"
    ]
  },
  {
    "ID": "BQ-015",
    "Categoria": "Herramientas",
    "product_title": "Set Sujetadores de Escenografía",
    "descripción": "Pinzas resistentes para sujetar fondos fotográficos, planos de papel o placas de escenario en tu set de stop motion.",
    "size": "",
    "stock": 80,
    "precio": 6990,
    "image_url": "https://dummyimage.com/600x600/444444/f39200.png&text=Set+Sujetadores",
    "image_views": []
  }
];

const CAT_CLASS = { 'Makers':'maker', 'Herramientas':'tool', 'Merchandising':'merch', 'Art':'art' };
const catClass = c => CAT_CLASS[c] || 'maker';
const CLP = n => '$' + Number(n||0).toLocaleString('es-CL');
const productHref = id => 'producto.html?id=' + encodeURIComponent(id);

/* Clave canónica de variante — DEBE calzar con variantKey() del servidor
   (functions/_lib/stock.js): orden size→color→design, normalizado. */
function variantKey(v){
  const norm = s => String(s==null?'':s).trim().normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,'-');
  return [['size',v.size],['color',v.color],['design',v.design]]
    .filter(([,val]) => String(val==null?'':val).trim())
    .map(([k,val]) => k+':'+norm(val)).join('|');
}

function normalize(p){
  const cat = p.Categoria || p.category || 'Makers';
  const imgs = [p.image_url, ...(p.image_views||[])].filter(Boolean);

  // Variantes desde Contentful (o desde el fallback products.json con size[]).
  let variants = Array.isArray(p.variants) ? p.variants.slice() : [];
  if(!variants.length && (Array.isArray(p.size) ? p.size.length : p.size)){
    // Fallback: derivar variantes-solo-talla desde el viejo campo size.
    const sizes = Array.isArray(p.size) ? p.size : String(p.size).split(/[,/]/).map(s=>s.trim()).filter(Boolean);
    const price = (p.precio!=null ? p.precio : (p.price!=null ? p.price : 0));
    variants = sizes.map(s => ({ size:s, color:'', design:'', price, initial_stock:(p.stock!=null?p.stock:null) }));
  }
  variants = variants.map(v => ({
    key: variantKey(v), size:v.size||'', color:v.color||'', design:v.design||'',
    price: Math.round(Number(v.price!=null?v.price:(p.price!=null?p.price:0))||0),
    // stock inicial de Contentful — fallback de visualización si /api/stock (D1) no responde
    initial_stock: (v.initial_stock!=null ? Number(v.initial_stock) : null)
  }));

  const prices = variants.length ? variants.map(v=>v.price) : [(p.precio!=null?p.precio:(p.price!=null?p.price:0))];
  return {
    id: p.ID || p.id,
    name: p.product_title || p.name || 'Producto',
    cat,
    price: Math.min(...prices),            // "desde" cuando hay variantes con distinto precio
    priceMax: Math.max(...prices),
    desc: p['descripción'] || p.descripcion || p.desc || '',
    stock: (p.stock!=null ? p.stock : null),   // fallback simple
    detalles: p.detalles_html || '',             // Rich Text 'details' ya renderizado a HTML
    variants,                                    // [] => producto simple
    // Ejes de variación presentes (para decidir qué selectores mostrar).
    axes: ['size','color','design'].filter(ax => variants.some(v => v[ax])),
    images: imgs.length ? imgs : ['https://dummyimage.com/1000x1000/6f6f6f/fff&text=' + encodeURIComponent(p.product_title||'BlackQuack')]
  };
}
let PRODUCTS = RAW_FALLBACK.map(normalize);
const findProduct = id => PRODUCTS.find(x => x.id === id);

async function loadProducts(){
  try{
    if(typeof fetchProducts === 'function'){
      const cms = await fetchProducts();
      if(Array.isArray(cms) && cms.length){ PRODUCTS = cms.map(normalize); return; }
      console.warn('[BQ] Contentful respondió sin entries publicados — uso products.json');
    }
  }catch(e){ console.warn('[BQ] Contentful no disponible:', e.message); }
  try{
    const r = await fetch('products.json', { cache:'no-store' });
    if(r.ok){ const d = await r.json(); if(Array.isArray(d) && d.length) PRODUCTS = d.map(normalize); }
  }catch(e){ /* file:// — keep embedded fallback */ }
}

/* ---------- SHARED CHROME (nav / footer / cart / modal) ---------- */
const PAGE = document.body.dataset.page || '';
const NAV = [
  { k:'home', label:'Inicio', href:'index.html' },
  { k:'talleres', label:'Talleres', href:'talleres.html' },
  { k:'labs', label:'Labs', href:'labs.html' },
  { k:'tienda', label:'Tienda', href:'tienda.html' },
  { k:'nosotros', label:'Nosotros', href:'nosotros.html' },
  { k:'contacto', label:'Contacto', href:'contacto.html' }
];

function headerHTML(){
  const links = NAV.map(n => `<a href="${n.href}" data-hover class="${n.k===PAGE?'active':''}">${n.label}</a>`).join('');
  return `<header>
    <nav class="nav">
      <a href="index.html" class="brand-logo" data-hover><img class="wordmark" src="images/logo2.png" alt="BlackQuack"></a>
      <div class="nav-menu" id="navMenu">${links}</div>
      <div class="nav-actions">
        <button class="cart-btn" id="cartBtn" data-hover aria-label="Carrito">
          <i data-lucide="shopping-bag"></i>
          <span class="cart-count" id="cartCount" style="display:none">0</span>
        </button>
        <button class="nav-toggle" id="navToggle" data-hover aria-label="Menú"><i data-lucide="menu"></i></button>
      </div>
    </nav>
  </header>`;
}

function footerHTML(){
  const links = NAV.filter(n=>n.k!=='contacto').map(n=>`<a href="${n.href}" data-hover>${n.label}</a>`).join('');
  return `<footer id="contacto-foot">
    <div class="foot-cta">
      <div class="wrap foot-cta-in">
        <div>
          <span class="foot-eyebrow">¿Hacemos ruido juntos?</span>
          <h2 class="foot-big">HAGAMOS<br><span>QUACK.</span></h2>
        </div>
        <div class="foot-cta-actions">
          <button class="btn lg" data-hover onclick="openModal('workshopModal')"><i data-lucide="calendar-check"></i> Agenda tu taller</button>
          <a href="contacto.html" class="btn secondary lg" data-hover><i data-lucide="mail"></i> Contáctanos</a>
        </div>
      </div>
    </div>
    <div class="wrap">
      <div class="foot-cols">
        <div class="foot-brandcol">
          <img class="foot-logo" src="images/logo-nav-dark.svg" alt="BlackQuack">
          <p>Estudio de animación independiente, laboratorio pedagógico y taller Maker. Herramientas físicas para despertar la imaginación análoga.</p>
          <div class="foot-social">
            <a href="https://www.instagram.com/blackquack" target="_blank" rel="noopener" data-hover aria-label="Instagram">
              <svg viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M510.2,150.9c-1.2-27.2-5.6-45.8-11.9-62c-6.5-17.2-16.5-32.5-29.5-45.3c-12.8-13-28.3-23.1-45.2-29.4c-16.3-6.3-34.8-10.7-62-11.9c-27.4-1.3-36-1.6-105.4-1.6S178,0.9,150.8,2.1C123.6,3.3,105,7.7,88.8,14c-17.2,6.5-32.5,16.5-45.3,29.5C30.5,56.3,20.4,71.8,14,88.8c-6.3,16.3-10.7,34.8-11.9,62c-1.3,27.4-1.6,36-1.6,105.4S0.8,334.3,2,361.5c1.2,27.2,5.6,45.8,11.9,62c6.5,17.2,16.6,32.5,29.5,45.3c12.8,13,28.3,23.1,45.2,29.4c16.3,6.3,34.8,10.7,62,11.9c27.2,1.2,35.9,1.5,105.3,1.5c69.4,0,78.1-0.3,105.3-1.5c27.2-1.2,45.8-5.6,62-11.9c34.3-13.3,61.5-40.4,74.8-74.8c6.3-16.3,10.7-34.8,11.9-62c1.2-27.3,1.5-35.9,1.5-105.3S511.3,178.1,510.2,150.9 M464.1,359.5c-1.1,25-5.3,38.4-8.8,47.4c-8.6,22.3-26.3,39.9-48.5,48.5c-9,3.5-22.6,7.7-47.4,8.8c-27,1.2-35,1.5-103.2,1.5c-68.2,0-76.4-0.3-103.2-1.5c-25-1.1-38.4-5.3-47.4-8.8c-11.1-4.1-21.2-10.6-29.3-19.1c-8.5-8.3-15-18.3-19.1-29.3c-3.5-9-7.7-22.6-8.8-47.4c-1.2-27-1.5-35-1.5-103.2c0-68.2,0.3-76.4,1.5-103.2c1.1-25,5.3-38.4,8.8-47.4c4.1-11.1,10.6-21.2,19.2-29.4c8.3-8.5,18.3-15,29.3-19.1c9-3.5,22.6-7.7,47.4-8.8c27-1.2,35-1.5,103.2-1.5c68.3,0,76.4,0.3,103.2,1.5c25,1.1,38.4,5.3,47.4,8.8c11.1,4.1,21.2,10.6,29.3,19.1c8.5,8.3,15,18.3,19.1,29.4c3.5,9,7.7,22.6,8.8,47.4c1.2,27,1.5,35,1.5,103.2C465.6,324.6,465.3,332.6,464.1,359.5"/><path d="M256.1,124.9c-72.5,0-131.3,58.8-131.3,131.3c0,72.5,58.8,131.3,131.3,131.3c72.5,0,131.3-58.8,131.3-131.3C387.4,183.7,328.6,124.9,256.1,124.9 M256.1,341.3c-47,0-85.2-38.1-85.2-85.1c0-47,38.1-85.2,85.2-85.2c47,0,85.2,38.1,85.2,85.2C341.3,303.2,303.1,341.3,256.1,341.3"/><path d="M423.2,119.7c0,16.9-13.7,30.6-30.6,30.6c-16.9,0-30.6-13.7-30.6-30.6c0-16.9,13.7-30.6,30.6-30.6C409.5,89.1,423.2,102.8,423.2,119.7"/></svg>
            </a>
          </div>
        </div>
        <nav class="foot-nav">
          <h4>Explorar</h4>${links}
        </nav>
        <nav class="foot-nav">
          <h4>Contacto</h4>
          <a href="contacto.html" data-hover>Página de contacto</a>
          <a href="mailto:conta@blackquack.cl" data-hover>conta@blackquack.cl</a>
        </nav>
      </div>
      <div class="foot-bottom">
        <span>© 2026 BlackQuack — Ecosistema de animación independiente. Hecho con ruido en Chile 🇨🇱</span>
        <span class="foot-tag">MAKE SOME QUACK.</span>
      </div>
    </div>
  </footer>`;
}

function cartHTML(){
  return `<div class="overlay" id="overlay"></div>
  <aside class="cart" id="cart" aria-label="Carrito de compras">
    <div class="cart-head">
      <h3><i data-lucide="shopping-bag"></i> Tu Carrito</h3>
      <button class="icon-x" id="closeCart" data-hover><i data-lucide="x"></i></button>
    </div>
    <div class="cart-items" id="cartItems"></div>
    <div class="cart-foot" id="cartFoot" style="display:none">
      <div class="row"><span>Subtotal</span><span id="subtotal">$0</span></div>
      <div class="row" style="color:#666"><span>Envío</span><span>Se calcula al pagar</span></div>
      <div class="row total"><span>Total</span><span id="total">$0</span></div>
      <button class="btn lg" data-hover onclick="checkout()"><i data-lucide="credit-card"></i> Finalizar compra</button>
    </div>
  </aside>`;
}

function workshopModalHTML(){
  return `<div class="modal" id="workshopModal">
    <div class="modal-bg" onclick="closeModal('workshopModal')"></div>
    <div class="modal-card">
      <div class="modal-top">
        <div><h3>Agenda una demostración</h3><div class="sub">Taller Animakids en tu colegio</div></div>
        <button class="modal-close" data-hover onclick="closeModal('workshopModal')"><i data-lucide="x"></i></button>
      </div>
      <div class="modal-body" id="workshopBody">
        <p style="margin-bottom:20px">Completa tus datos y coordinamos una demo presencial del taller de animación STEAM en tu sala de clases.</p>
        <form id="workshopForm" onsubmit="submitWorkshop(event)">
          <div class="field"><label>Nombre del colegio</label><input required type="text" placeholder="Ej: Colegio Los Creadores"></div>
          <div class="field-row">
            <div class="field"><label>Ciudad</label><input required type="text" placeholder="Ej: Quilpué"></div>
            <div class="field"><label>Persona de contacto</label><input required type="text" placeholder="Nombre y cargo"></div>
          </div>
          <div class="field"><label>Email</label><input required type="email" placeholder="contacto@colegio.cl"></div>
          <div class="field">
            <label>Cantidad de alumnos</label>
            <div class="stepper">
              <button type="button" onclick="stepStudents(-5)">−</button>
              <span id="studentCount">25</span>
              <button type="button" onclick="stepStudents(5)">+</button>
            </div>
          </div>
          <button type="submit" class="cta-brutal" style="margin-top:8px" data-hover><i data-lucide="send"></i> Enviar solicitud</button>
        </form>
      </div>
    </div>
  </div>`;
}

/* ---------- INJECT CHROME ---------- */
const preHTML = document.body.hasAttribute('data-preloader')
  ? `<div id="preloader"><lottie-player src="blacky.json" background="transparent" speed="1" style="width:280px;height:280px" loop autoplay></lottie-player><p>INITIALIZING_QUACK...</p></div>` : '';
document.body.insertAdjacentHTML('afterbegin',
  `<div class="cursor-dot" id="curDot"></div><div class="cursor-ring" id="curRing"></div>` + preHTML + headerHTML());
document.body.insertAdjacentHTML('beforeend',
  footerHTML() + cartHTML() + workshopModalHTML() + `<div class="confetti-layer" id="confettiLayer"></div>`);
lucide.createIcons();

/* ---------- PRELOADER ---------- */
(function(){
  const pre=document.getElementById('preloader'); if(!pre) return;
  if(sessionStorage.getItem('bq_splash_v5')){ pre.style.display='none'; return; }
  window.addEventListener('load',()=>{ setTimeout(()=>{ pre.classList.add('preloader-hidden'); sessionStorage.setItem('bq_splash_v5','1'); setTimeout(()=>pre.style.display='none',800); },2600); });
})();

/* ---------- CUSTOM CURSOR ---------- */
(function(){
  const dot=document.getElementById('curDot'),ring=document.getElementById('curRing');
  let rx=0,ry=0,mx=0,my=0;
  window.addEventListener('mousemove',e=>{mx=e.clientX;my=e.clientY;dot.style.left=mx+'px';dot.style.top=my+'px';});
  (function loop(){rx+=(mx-rx)*.18;ry+=(my-ry)*.18;ring.style.left=rx+'px';ring.style.top=ry+'px';requestAnimationFrame(loop);})();
  document.addEventListener('mouseover',e=>{if(e.target.closest('[data-hover]'))ring.classList.add('hovering');});
  document.addEventListener('mouseout',e=>{if(e.target.closest('[data-hover]'))ring.classList.remove('hovering');});
})();

/* ---------- MOBILE NAV ---------- */
(function(){
  const navMenu=document.getElementById('navMenu'),navToggle=document.getElementById('navToggle');
  navToggle.addEventListener('click',()=>navMenu.classList.toggle('open'));
  navMenu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>navMenu.classList.remove('open')));
})();

/* ---------- MARQUEE (if present) ---------- */
(function(){ const mq=document.getElementById('marquee'); if(mq) mq.innerHTML+=mq.innerHTML; })();

/* ---------- ANIMAKIDS video carousel (if present) ---------- */
(function(){
  const vt=document.getElementById('vidTrack'); if(!vt) return;
  const step=()=>Math.min(vt.clientWidth*0.85,460);
  const prev=document.getElementById('vidPrev'), next=document.getElementById('vidNext');
  if(prev) prev.addEventListener('click',()=>vt.scrollBy({left:-step(),behavior:'smooth'}));
  if(next) next.addEventListener('click',()=>vt.scrollBy({left:step(),behavior:'smooth'}));
})();

/* ---------- STORE PLP ---------- */
function productCard(p){
  const priceLabel = p.variants.length && p.priceMax>p.price ? 'Desde '+CLP(p.price) : CLP(p.price);
  return `<a class="product" href="${productHref(p.id)}" data-cat="${p.cat}" aria-label="${p.name}">
    <div class="art">
      <span class="line-badge ${catClass(p.cat)}">${p.cat}</span>
      ${p.stock===0?'<span class="stock-flag out">Agotado</span>':''}
      <img src="${p.images[0]}" alt="${p.name}" loading="lazy">
      <span class="card-cta">Ver producto</span>
    </div>
    <div class="body">
      <span class="price">${priceLabel}</span>
      <h3>${p.name}</h3>
      <span class="cat-sub">${p.cat}</span>
    </div>
  </a>`;
}
function renderStore(filter='all'){
  const grid=document.getElementById('storeGrid'); if(!grid) return;
  const limit=parseInt(grid.dataset.limit||'0',10);
  let list=PRODUCTS.filter(p=>filter==='all'||p.cat===filter);
  if(limit>0) list=list.slice(0,limit);
  grid.innerHTML=list.map(productCard).join('');
  lucide.createIcons();
}
/* Carrusel del big hero (home): primeros productos en una fila con scroll. */
function renderHeroCarousel(){
  const track=document.getElementById('heroCarousel'); if(!track) return;
  track.innerHTML=PRODUCTS.slice(0,8).map(productCard).join('');
  lucide.createIcons();
}
function buildTabs(){
  const tabs=document.getElementById('storeTabs'); if(!tabs) return;
  const cats=[...new Set(PRODUCTS.map(p=>p.cat))];
  tabs.innerHTML=`<button class="active" data-tab="all" data-hover>Todo</button>`+cats.map(c=>`<button data-tab="${c}" data-hover>${c}</button>`).join('');
  tabs.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
    tabs.querySelectorAll('button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); renderStore(b.dataset.tab);
  }));
}

/* Arma un acordeón minimalista a partir del HTML del Rich Text 'details',
   agrupando por encabezados (h2/h3 o párrafos cortos en mayúsculas). */
function buildDetailsAccordion(html){
  if(!html) return '';
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const tmp=document.createElement('div'); tmp.innerHTML=html;
  const kids=Array.prototype.slice.call(tmp.children);
  const isHead=el=>{
    if(/^H[1-6]$/.test(el.tagName)) return true;
    if(el.tagName==='P'){ const t=el.textContent.trim(); return t.length>0 && t.length<=52 && t===t.toUpperCase(); }
    return false;
  };
  const secs=[]; let cur=null;
  kids.forEach(el=>{
    if(isHead(el)){ cur={t:el.textContent.trim(), b:''}; secs.push(cur); }
    else if(cur){ cur.b+=el.outerHTML; }
    else { cur={t:'Detalles del producto', b:el.outerHTML}; secs.push(cur); }
  });
  if(!secs.length) return '';
  return `<div class="pdp-acc">${secs.map((s,i)=>
    `<details class="pdp-acc-item"${i===0?' open':''}><summary>${esc(s.t)}<span class="pdp-acc-ic" aria-hidden="true"></span></summary><div class="pdp-acc-body pdp-details-inner">${s.b}</div></details>`
  ).join('')}</div>`;
}

/* ---------- PDP ---------- */
function renderPDP(){
  const root=document.getElementById('pdpRoot'); if(!root) return;
  const id=new URLSearchParams(location.search).get('id');
  const p=findProduct(id)||PRODUCTS[0];
  const imgs=p.images;
  document.title=p.name+' — BlackQuack';
  const storyImg=imgs[1]||imgs[0];
  const band=[imgs[0], imgs[1]||imgs[0], imgs[2]||imgs[1]||imgs[0]];
  // Contenedor de selectores; se puebla en pdpInitVariants() tras leer /api/stock.
  const sizeBlock = p.variants.length
    ? `<div id="pdpVariants" class="pdp-variants"><div class="pdp-loading"><i data-lucide="loader"></i> Cargando disponibilidad…</div></div>`
    : '';
  // Línea de stock: muestra la CANTIDAD real (se actualiza en pdpRefresh).
  const stockLine = `<span id="pdpStockBadge" class="pdp-stock"></span>`;
  const related = PRODUCTS.filter(x=>x.id!==p.id).slice(0,3);

  root.innerHTML=`
    <nav class="breadcrumb wrap">
      <a href="index.html" data-hover>Inicio</a><i data-lucide="chevron-right"></i>
      <a href="tienda.html" data-hover>Tienda</a><i data-lucide="chevron-right"></i>
      <span>${p.name}</span>
    </nav>

    <section class="pdp-top wrap">
      <div class="pdp-gallery">
        ${imgs.map((src,i)=>`<figure class="pdp-shot"><img src="${src}" alt="${p.name} — vista ${i+1}" loading="${i<2?'eager':'lazy'}"></figure>`).join('')}
      </div>
      <div class="pdp-info">
        <div class="pdp-eyebrow-row"><span class="eyebrow ${catClass(p.cat)==='tool'?'accent':'brand'}">${p.cat}</span>${stockLine}</div>
        <h1 class="pdp-title">${p.name}</h1>
        <div class="pdp-price" id="pdpPrice">${p.variants.length && p.priceMax>p.price ? 'Desde '+CLP(p.price) : CLP(p.price)}</div>
        <p class="pdp-desc">${p.desc}</p>
        ${sizeBlock}
        <div class="pdp-buy">
          <button class="btn dark lg" id="pdpBuy" data-hover onclick="pdpBuy('${p.id}')">Comprar ahora</button>
          <button class="btn secondary lg" id="pdpAdd" data-hover onclick="pdpAdd('${p.id}')"><i data-lucide="shopping-bag"></i> Agregar al carrito</button>
        </div>
        <div class="pdp-trust">
          <span><i data-lucide="heart-handshake"></i> Hecho con corazón maker</span>
          <span><i data-lucide="map-pin"></i> Diseñado en Chile</span>
        </div>
        ${buildDetailsAccordion(p.detalles)}
      </div>
    </section>

    <section class="pdp-story">
      <div class="wrap pdp-story-grid">
        <div class="pdp-story-copy">
          <span class="eyebrow accent">Hecho para crear</span>
          <h2>${p.name}</h2>
          <p>${p.desc}</p>
          <p style="opacity:.7">Diseñado por BlackQuack — donde el error es el punto de partida, no el final. Make some Quack.</p>
        </div>
        <figure class="pdp-story-img"><img src="${storyImg}" alt="${p.name} en uso"></figure>
      </div>
    </section>

    <section class="pdp-band">
      ${band.map((src,i)=>`<figure><img src="${src}" alt="${p.name} — vista ${i+1}" loading="lazy"></figure>`).join('')}
    </section>

    <section class="pdp-related wrap">
      <div class="reel-label"><span style="color:var(--color-dark)">También te puede gustar</span><div class="ln" style="background:var(--color-dark);opacity:.2"></div></div>
      <div class="store-grid">${related.map(productCard).join('')}</div>
    </section>`;
  lucide.createIcons();
  pdpInitVariants(p);
}
function pdpSelect(btn,src){
  document.getElementById('pdpMain').src=src;
  document.querySelectorAll('.pdp-thumb').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
}

/* ---------- PDP VARIANTES + STOCK EN VIVO ---------- */
let PDP = null; // { product, stockByKey:{key:qty}, sel:{size,color,design} }
const AXIS_LABEL = { size:'Tamaño / Talla', color:'Color', design:'Diseño' };

async function pdpInitVariants(p){
  PDP = { product:p, stockByKey:{}, sel:{} };

  // Stock EN VIVO (D1) para TODOS los productos, incluidos los simples.
  try{
    const r = await fetch('/api/stock?product='+encodeURIComponent(p.id), { cache:'no-store' });
    const d = await r.json();
    if(!r.ok || !Array.isArray(d.variants)) throw new Error('sin endpoint');
    d.variants.forEach(v=>{ PDP.stockByKey[v.key]=v.qty; });
  }catch(e){
    // Fallback: stock inicial de Contentful (para abrir el archivo local sin D1).
    if(p.variants.length) p.variants.forEach(v=>{ PDP.stockByKey[v.key]=(v.initial_stock!=null?v.initial_stock:null); });
    else PDP.stockByKey['']=(p.stock!=null?p.stock:null); // simple: stock global de Contentful
  }

  if(!p.variants.length){ pdpRefresh(); return; } // simple: sin selectores

  const box=document.getElementById('pdpVariants'); if(!box) return;
  // Selectores: un grupo por eje presente; cada opción es un valor distinto.
  box.innerHTML = p.axes.map(ax=>{
    const vals=[...new Set(p.variants.map(v=>v[ax]).filter(Boolean))];
    return `<div class="pdp-vgroup" data-axis="${ax}">
      <span class="pdp-lbl">${AXIS_LABEL[ax]}</span>
      <div class="chip-row">${vals.map(val=>{
        const soldOut=pdpValueSoldOut(ax,val);
        return `<button class="size-chip${soldOut?' out':''}" data-hover data-axis="${ax}" data-val="${val.replace(/"/g,'&quot;')}"${soldOut?' disabled':''} onclick="pdpPick(this)">${val}${soldOut?' <small>agotado</small>':''}</button>`;
      }).join('')}</div>
    </div>`;
  }).join('');
  lucide.createIcons();
  pdpRefresh();
}

/* Un valor de eje está agotado si TODA variante que lo contiene tiene stock 0.
   (con stock null/desconocido, no lo damos por agotado). */
function pdpValueSoldOut(axis,val){
  const rel=PDP.product.variants.filter(v=>v[axis]===val);
  return rel.length>0 && rel.every(v=>PDP.stockByKey[v.key]===0);
}
function pdpSelectedVariant(){
  const p=PDP.product;
  if(!p.variants.length) return null;
  if(!p.axes.every(ax=>PDP.sel[ax])) return null;
  const key=variantKey(PDP.sel);
  return p.variants.find(v=>v.key===key)||null;
}
function pdpPick(btn){
  if(btn.disabled) return;
  const ax=btn.dataset.axis, val=btn.dataset.val;
  PDP.sel[ax]=val;
  btn.parentElement.querySelectorAll('.size-chip').forEach(s=>s.classList.remove('active'));
  btn.classList.add('active');
  pdpRefresh();
}

/* Sincroniza precio, badge de stock y estado de los botones de compra. */
function pdpRefresh(){
  const p=PDP.product;
  const priceEl=document.getElementById('pdpPrice');
  const badge=document.getElementById('pdpStockBadge');
  const buy=document.getElementById('pdpBuy'), add=document.getElementById('pdpAdd');
  let qty=null, canBuy=true, price=p.price;

  if(p.variants.length){
    const v=pdpSelectedVariant();
    if(!v){ // aún sin elegir todo
      canBuy=false;
      if(badge) badge.innerHTML='<i data-lucide="hand-pointer"></i> Elige '+p.axes.map(a=>AXIS_LABEL[a].toLowerCase()).join(' y ');
    } else {
      price=v.price; qty=PDP.stockByKey[v.key];
      if(qty===0) canBuy=false;
    }
    if(priceEl) priceEl.textContent=(!v)?(p.priceMax>p.price?'Desde '+CLP(p.price):CLP(p.price)):CLP(price);
  } else {
    // Producto simple: stock en vivo (D1) si existe, si no el global de Contentful.
    qty = PDP.stockByKey['']!=null ? PDP.stockByKey[''] : (p.stock!=null?p.stock:null);
    if(qty===0) canBuy=false;
  }

  // Muestra la CANTIDAD real de stock (no un chip genérico "En stock").
  if(badge && (!p.variants.length || pdpSelectedVariant())){
    if(qty===0) badge.innerHTML='<i data-lucide="x-circle"></i> Agotado';
    else if(qty!=null) badge.innerHTML='<i data-lucide="check-circle"></i> '+qty+' '+(qty===1?'disponible':'disponibles');
    else badge.innerHTML='';
    badge.className='pdp-stock '+(qty===0?'out':(qty!=null&&qty<=5?'low':'ok'));
  }
  [buy,add].forEach(b=>{ if(b) b.disabled=!canBuy; });
  if(window.lucide) lucide.createIcons();
}
function pdpAdd(id){ if(addToCart(id, PDP?PDP.sel:{})) {/* ok */} }
function pdpBuy(id){ buyNow(id, PDP?PDP.sel:{}); }

/* ---------- CART (localStorage) ----------
   Indexado por SKU. Cada entrada: cart[sku] = { id, key, size, color, design, qty }.
   sku = id + '#' + variantKey (para producto simple, key='' → sku = id + '#'). */
let cart = JSON.parse(localStorage.getItem('bq_cart_v5') || '{}');
// Migración: carritos viejos guardaban cart[id] = qty (número). Se descartan.
if(Object.values(cart).some(v => typeof v === 'number')) cart = {};
const cartEl=document.getElementById('cart'), overlay=document.getElementById('overlay'), cartCount=document.getElementById('cartCount');
const saveCart=()=>localStorage.setItem('bq_cart_v5',JSON.stringify(cart));
function openCart(){cartEl.classList.add('open');overlay.classList.add('show');}
function closeCartFn(){cartEl.classList.remove('open');overlay.classList.remove('show');}
document.getElementById('cartBtn').addEventListener('click',openCart);
document.getElementById('closeCart').addEventListener('click',closeCartFn);
overlay.addEventListener('click',closeCartFn);
function cartQtyTotal(){return Object.values(cart).reduce((a,l)=>a+(l.qty||0),0);}
function updateCount(pop){
  const c=cartQtyTotal();
  cartCount.textContent=c; cartCount.style.display=c?'grid':'none';
  if(pop){cartCount.classList.remove('pop');void cartCount.offsetWidth;cartCount.classList.add('pop');}
}
const skuOf = (id, attrs) => id + '#' + variantKey(attrs||{});

/* addToCart(id, attrs) — attrs = {size,color,design} de la variante elegida.
   Producto simple: attrs vacío. Devuelve false si falta elegir variante. */
function addToCart(id, attrs){
  const p = findProduct(id); if(!p) return false;
  attrs = attrs || {};
  // Si el producto tiene ejes de variación, exige que estén todos elegidos.
  if(p.axes.length && !p.axes.every(ax => attrs[ax])) return false;
  const sku = skuOf(id, attrs);
  if(cart[sku]) cart[sku].qty++;
  else cart[sku] = { id, key: variantKey(attrs), size:attrs.size||'', color:attrs.color||'', design:attrs.design||'', qty:1 };
  saveCart(); renderCart(); updateCount(true); return true;
}
function changeQtyBySku(sku,d){ if(!cart[sku])return; cart[sku].qty+=d; if(cart[sku].qty<=0)delete cart[sku]; saveCart(); renderCart(); updateCount(false); }
function buyNow(id, attrs){ if(addToCart(id, attrs)) openCart(); }
function renderCart(){
  const items=document.getElementById('cartItems'), foot=document.getElementById('cartFoot');
  const ids=Object.keys(cart);
  if(!ids.length){
    items.innerHTML=`<div class="cart-empty"><i data-lucide="package-open"></i><p>Tu carrito está vacío.<br>¡Hora de hacer Quack!</p></div>`;
    foot.style.display='none'; lucide.createIcons(); return;
  }
  let sub=0;
  items.innerHTML=ids.map(sku=>{
    const l=cart[sku]; const p=findProduct(l.id); if(!p){delete cart[sku];return'';}
    // Precio de la variante concreta (o del producto si es simple).
    const variant = p.variants.find(v=>v.key===l.key);
    const unit = variant ? variant.price : p.price;
    const q=l.qty; sub+=unit*q;
    const label=[l.size,l.color,l.design].filter(Boolean).join(' · ');
    return `<div class="ci">
      <div class="thumb"><img src="${p.images[0]}" alt="${p.name}"></div>
      <div class="info">
        <h4>${p.name}</h4>
        ${label?`<div class="ci-variant">${label}</div>`:''}
        <div class="p">${CLP(unit)}</div>
        <div class="qty">
          <button data-hover onclick="changeQtyBySku('${sku}',-1)">−</button><span>${q}</span><button data-hover onclick="changeQtyBySku('${sku}',1)">+</button>
        </div>
      </div>
      <button class="rm" data-hover onclick="changeQtyBySku('${sku}',-99)"><i data-lucide="trash-2"></i></button>
    </div>`;
  }).join('');
  document.getElementById('subtotal').textContent=CLP(sub);
  document.getElementById('total').textContent=CLP(sub);
  foot.style.display='block'; lucide.createIcons();
}
function checkout(){ closeCartFn(); cart={}; saveCart(); renderCart(); updateCount(false); fireConfetti(); alert('¡Gracias por tu compra! 🦆 Tu pedido BlackQuack está en camino. (Checkout simulado)'); }

/* ---------- MODALS ---------- */
function openModal(id){document.getElementById(id).classList.add('show');document.body.style.overflow='hidden';lucide.createIcons();}
function closeModal(id){document.getElementById(id).classList.remove('show');document.body.style.overflow='';}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.querySelectorAll('.modal.show').forEach(m=>closeModal(m.id));closeCartFn();}});
let students=25;
function stepStudents(d){students=Math.max(5,students+d);document.getElementById('studentCount').textContent=students;}
function submitWorkshop(e){
  e.preventDefault();
  document.getElementById('workshopBody').innerHTML=`
    <div class="success">
      <div class="check"><i data-lucide="check"></i></div>
      <h3>¡Solicitud enviada!</h3>
      <p>Gracias por querer hacer Quack en tu colegio. Te contactaremos muy pronto para coordinar la demo con <strong>${students} alumnos</strong>.</p>
      <button class="btn" data-hover onclick="closeModal('workshopModal')">Cerrar</button>
    </div>`;
  lucide.createIcons(); fireConfetti();
}

/* ---------- CONTACT FORM (if present) ---------- */
(function(){
  const f=document.getElementById('contactForm'); if(!f) return;
  f.addEventListener('submit',e=>{
    e.preventDefault();
    f.innerHTML=`<div class="success"><div class="check"><i data-lucide="check"></i></div><h3>¡Mensaje enviado!</h3><p>Gracias por escribirnos. Te responderemos muy pronto con harto Quack. 🦆</p></div>`;
    lucide.createIcons(); fireConfetti();
  });
})();

/* ---------- CONFETTI ---------- */
function fireConfetti(){
  const layer=document.getElementById('confettiLayer'); if(!layer) return;
  const colors=['#F39200','#DEC520','#444444','#FFFFFF'];
  for(let i=0;i<90;i++){
    const c=document.createElement('div'); c.className='confetti';
    const seed=(i*47)%100;
    c.style.left=seed+'%'; c.style.background=colors[i%colors.length];
    c.style.animationDuration=(1.8+(i%10)*.18)+'s'; c.style.animationDelay=(i%12)*.06+'s';
    c.style.transform='rotate('+(seed*3.6)+'deg)'; if(i%3===0)c.style.borderRadius='50%';
    layer.appendChild(c); setTimeout(()=>c.remove(),3600);
  }
}
function pulsePlay(btn){btn.style.transform='scale(.85)';setTimeout(()=>btn.style.transform='',180);}

/* ---------- SCROLL REVEAL ---------- */
function revealInit(){
  const io=new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting){e.target.style.opacity=1;e.target.style.transform='none';e.target.style.transition='all .7s cubic-bezier(.25,.8,.25,1)';io.unobserve(e.target);}});},{threshold:.12});
  document.querySelectorAll('.sec-head,.product,.principle,.ak-grid figure,.lb,.vid-card,.pdp-story,.pdp-band figure,.spec,.page-hero').forEach((el,i)=>{el.style.opacity=0;el.style.transform='translateY(28px)';el.style.transitionDelay=(i%4*.06)+'s';io.observe(el);});
}

/* ---------- INIT (after products load) ---------- */
loadProducts().then(()=>{
  buildTabs();
  renderStore();
  renderHeroCarousel();
  renderPDP();
  renderCart();
  updateCount(false);
  revealInit();
});

/* ---------- SHOWCASE: video que se encoge a una grilla bento al scrollear ---------- */
(function(){
  const section=document.getElementById('showcase'); if(!section) return;
  const sticky=section.querySelector('.showcase-sticky');
  const bento=section.querySelector('.bento');
  const cell=section.querySelector('.bento-video');
  const cells=Array.prototype.slice.call(section.querySelectorAll('.bento-cell'));
  const cue=section.querySelector('.showcase-cue');
  const overlay=section.querySelector('.showcase-overlay'); // texto sobre el video (solo home)
  const video=cell.querySelector('video');
  if(video){ video.muted=true; video.play().catch(()=>{}); }

  const SPREAD=0.6; // cuánto se separan las fotos al inicio (fracción de su distancia al centro)

  /* Dos movimientos combinados con el scroll:
     1) La GRILLA completa hace zoom-out desde el centro del video (solo se ve el
        video al inicio → grilla final al terminar).
     2) Cada foto arranca SEPARADA (empujada hacia afuera) y se va JUNTANDO hasta
        su posición en la grilla. */
  let coverScale=1, tx0=0, ty0=0, vecs=[];
  function measure(){
    bento.style.transform='none';
    cells.forEach(c=>{ c.style.transform='none'; });
    const cr=cell.getBoundingClientRect();
    const sr=sticky.getBoundingClientRect();
    const br=bento.getBoundingClientRect();
    const bcx=br.left+br.width/2, bcy=br.top+br.height/2;
    // vector de cada celda desde el centro de la grilla (para la separación)
    vecs=cells.map(c=>{ const r=c.getBoundingClientRect(); return {el:c, dx:(r.left+r.width/2)-bcx, dy:(r.top+r.height/2)-bcy}; });
    // origen del zoom = centro del video, relativo a la grilla
    bento.style.transformOrigin=((cr.left-br.left)+cr.width/2).toFixed(1)+'px '+((cr.top-br.top)+cr.height/2).toFixed(1)+'px';
    // llevar ese centro al centro del viewport (sticky anclado en top:0)
    const vw=window.innerWidth, vh=window.innerHeight;
    tx0=vw/2-((cr.left-sr.left)+cr.width/2); ty0=vh/2-((cr.top-sr.top)+cr.height/2);
    coverScale=Math.max(vw/cr.width, vh/cr.height)*1.05;
  }
  const easeOutCubic=t=>1-Math.pow(1-t,3);

  let ticking=false;
  function render(){
    ticking=false;
    const rect=section.getBoundingClientRect();
    const total=section.offsetHeight-window.innerHeight;
    let p=total>0 ? (-rect.top)/total : 0;
    p=Math.max(0,Math.min(1,p));
    const e=easeOutCubic(p);
    // 1) zoom-out de la grilla
    const s=1+(coverScale-1)*(1-e);
    bento.style.transform='translate('+(tx0*(1-e)).toFixed(1)+'px,'+(ty0*(1-e)).toFixed(1)+'px) scale('+s.toFixed(4)+')';
    // 2) separación de las fotos que decrece hasta juntarse (el video no se mueve)
    const spread=SPREAD*(1-e);
    for(let i=0;i<vecs.length;i++){
      vecs[i].el.style.transform='translate('+(vecs[i].dx*spread).toFixed(1)+'px,'+(vecs[i].dy*spread).toFixed(1)+'px)';
    }
    if(cue) cue.style.opacity=Math.max(0,1-p*4).toFixed(2);
    // el texto sobre el video se desvanece gradualmente en la 1ª parte del scroll
    if(overlay){ const o=Math.max(0,1-p*2.4); overlay.style.opacity=o.toFixed(2); overlay.style.pointerEvents=o<0.1?'none':''; }
  }
  function onScroll(){ if(!ticking){ ticking=true; requestAnimationFrame(render); } }

  measure(); render();
  window.addEventListener('scroll', onScroll, {passive:true});
  window.addEventListener('resize', ()=>{ measure(); render(); });
  if(video) video.addEventListener('loadedmetadata', ()=>{ measure(); render(); });
})();
