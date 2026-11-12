const pad = n => String(n).padStart(2,'0');
  export function cover(entry, index) {
    const drawings = {
      rag: '<path d="M39 57h45v62H39zM45 51h45v62M51 45h45v62M48 71h24m-24 8h24m-24 8h16M96 81h31m66 0h31"/><circle cx="160" cy="81" r="33"/><path d="m221 78 4 3-4 3M238 56h40v50h-40zM247 70h21m-21 8h21m-21 8h13"/><text x="145" y="85">RAG</text><path d="M160 114v25m-43 0h86m-86 0v10m43-10v10m43-10v10"/><circle cx="117" cy="153" r="4"/><circle cx="160" cy="153" r="4"/><circle cx="203" cy="153" r="4"/>',
      report: '<path d="M84 31h151v157H84zM102 52h41m-41 8h23M102 160h113"/><path d="M106 146v-26h17v26m13 0v-47h17v47m13 0V87h17v59m13 0v-72h17v72"/><text x="101" y="85" class="svg-large">AI</text><text x="183" y="53">01 /</text>',
      project: '<rect x="44" y="41" width="233" height="140" rx="6"/><path d="M44 63h233M61 52h2m7 0h2m7 0h2M99 63v118M60 85h23m-23 13h15m-15 13h20"/><rect x="116" y="81" width="141" height="34" rx="3"/><path d="M127 94h76m-76 8h51M116 130h96m-96 9h118m-118 9h83M237 103l8-8m-6 0h6v6"/>',
      prompt: '<rect x="52" y="47" width="151" height="105" rx="4"/><path d="M69 67h53m-53 47h82m-82 9h52"/><text x="69" y="97" class="svg-medium">What if_</text><rect x="120" y="91" width="151" height="88" rx="4" class="svg-paper"/><text x="137" y="113">ITERATION / 02</text><text x="137" y="147" class="svg-medium">Try again.</text><path d="m242 148 12-12m-10 0h10v10"/>',
      reading: '<path d="M160 63Q112 38 57 54v112q54-14 103 9 48-23 103-9V54q-56-16-103 9v112M63 172q49-11 97 10 47-21 97-10M160 182v-7M74 76q34-6 66 6m-66 6q34-6 66 6m-66 6q34-6 66 6m-66 6q34-6 49 2M180 80q31-12 65-5m-65 18q31-12 65-5m-65 18q31-12 65-5m-65 18q31-12 65-5m-65 18q31-12 47-8"/>',
      garden: '<rect x="64" y="34" width="192" height="151" rx="5"/><path d="M64 53h192M78 44h19m112 0h33M84 77h75m-75 10h58m-58 12h83"/><rect x="84" y="118" width="42" height="37" rx="2"/><rect x="139" y="118" width="42" height="37" rx="2"/><rect x="194" y="118" width="42" height="37" rx="2"/><path d="m95 143 8-12 10 12m35-9h24m-24 7h17m31-6h27M84 168h41m14 0h42m13 0h42"/>'
    };
    const labels = { rag:'KNOWLEDGE / CONNECTED', report:'LEARNING / REVIEW', project:'IDEA / PROTOTYPE', prompt:'INPUT / ITERATION', reading:'READ / REFLECT', garden:'NOTES / WORK' };
    const key = Object.hasOwn(drawings,entry.visual) ? entry.visual : 'garden';
    return `<div class="card-cover cover-${key}" aria-hidden="true"><span class="cover-caption">${labels[key]}</span><svg viewBox="0 0 320 220" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">${drawings[key]}</svg><span class="cover-number">${pad(index+1)}</span></div>`;
  }

