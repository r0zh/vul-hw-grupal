// Contrato de aprendizaje de <cpa-curves>: las curvas de éxito medidas de las
// secciones 10 y 11 dicen los mismos números que el texto y que la memoria.
import { dataOf, countOf, textOf, widgetText, assert } from './helpers.mjs';

const A = '#curva-real', B = '#curva-cm';

export const spec = {
  slug: 'cpa-curves',
  title: 'Cuántas trazas hacen falta, medido',
  page: '/web/index.html',
  widget: A,
  ready: `!!document.querySelector('${A}[data-rendered]') && !!document.querySelector('${B}[data-rendered]')`,
  claims: [
    { id: 'real-attack-95-112-132', why: 'la curva del ataque real: la mitad de las ordenaciones con 95 trazas, el 90 % con 112 y todas con 132',
      async run({ page }) {
        assert((await textOf(page, `${A} .real-badge`)).toLowerCase().includes('medida real'), 'falta la etiqueta de medida real');
        assert(await dataOf(page, A, 'orderings') === '100', 'no son 100 ordenaciones');
        assert(await dataOf(page, A, 'n50') === '95' && await dataOf(page, A, 'n90') === '112' && await dataOf(page, A, 'n100') === '132',
          `n50, n90, n100 = ${await dataOf(page, A, 'n50')}, ${await dataOf(page, A, 'n90')}, ${await dataOf(page, A, 'n100')}`);
        const text = await widgetText(page, A);
        assert(text.includes('95') && text.includes('112') && text.includes('132'), `el texto no da las tres cifras: ${text}`);
        assert(await countOf(page, `${A} path.cv-line`) === 1 && await countOf(page, `${A} path.cv-bytes`) === 1, 'faltan la curva de la clave o la de los bytes');
      } },
    { id: 'countermeasures-132-475-never', why: 'las tres variantes medidas: 132 trazas sin contramedida, 475 con barajado y nunca con retardos',
      async run({ page }) {
        assert(await dataOf(page, B, 'series') === 'cm-base,cm-barajado,cm-retardos', 'no están las tres variantes');
        assert(await dataOf(page, B, 'n90') === '132,475,', `n90 = ${await dataOf(page, B, 'n90')}`);
        assert(await countOf(page, `${B} path.cv-line`) === 3, 'no hay tres curvas');
        const text = await widgetText(page, B);
        assert(text.includes('132') && text.includes('475') && text.includes('no sale en ninguna'), `el texto no lo dice: ${text}`);
        // El barajado multiplica por 3,6 las trazas del 90 %.
        assert((475 / 132).toFixed(1) === '3.6', 'el factor del barajado no es 3,6');
      } },
  ],
};
