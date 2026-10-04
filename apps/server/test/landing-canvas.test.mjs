import {describe,it,expect} from 'vitest';
import {toLandingCanvas,fromLandingCanvas,firstVisibleOfferId,LANDING_BLOCKS} from '../../web/src/features/refinement/landing-puck-adapter.ts';
import {applyLandingSectionImage,toLanding,fromLanding,withStableLandingSectionIds} from '../../web/src/features/refinement/landing-adapter.ts';
import {renderLandingHtml,renderLandingReactCode} from '@our-platform/shared';
describe('Hallazia visual editor boundary',()=>{
 it('selects only the first visible offer as the visual CTA target',()=>{
  const value=toLanding({title:'Página',sections:[{type:'hero',cta:'Ver detalles'},{type:'offer',headline:'Oferta',enabled:false}]});
  const data=toLandingCanvas(value);
  expect(firstVisibleOfferId(data)).toBeNull();
  data.content[1].props.enabled=true;
  expect(firstVisibleOfferId(data)).toBe(data.content[1].props.id);
  data.content.push({...data.content[1],props:{...data.content[1].props,id:'second-offer'}});
  expect(firstVisibleOfferId(data)).toBe(data.content[1].props.id);
 });
 it('assigns stable unique IDs to legacy sections before asynchronous image work',()=>{
  const value=toLanding({title:'Página',sections:[{type:'hero'},{type:'problem'},{id:'kept',type:'offer'},{id:'kept',type:'faq'}]});
  const normalized=withStableLandingSectionIds(value),ids=normalized.sections.map(section=>section.id);
  expect(ids.every(id=>typeof id==='string'&&id.length>0)).toBe(true);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids[2]).toBe('kept');
  expect(withStableLandingSectionIds(normalized)).toEqual(normalized);
 });
 it('attaches an asynchronous image to its original section after sections are reordered',()=>{
  const normalized=withStableLandingSectionIds(toLanding({title:'Página',sections:[{type:'hero'},{type:'problem'}]}));
  const target=normalized.sections[0];
  const reordered=[...normalized.sections].reverse();
  const updated=applyLandingSectionImage(reordered,target.id,'/assets/hero.webp','Hero');
  expect(updated.find(section=>section.id===target.id)?.imageUrl).toBe('/assets/hero.webp');
  expect(updated.find(section=>section.id!==target.id)?.imageUrl).toBeUndefined();
 });
 it('provides every required block and retains unknown sections, evidence and metadata across reorder/disable',()=>{
  expect(Object.keys(LANDING_BLOCKS)).toHaveLength(15);
  const value=toLanding({title:'Página',sections:[{type:'hero',headline:'Apertura',evidenceIds:['ref'],extra:{keep:true}},{type:'future-block',headline:'Custom',items:[{q:'Pregunta',a:'Respuesta',source:'keep'}]}]});
  const data=toLandingCanvas(value);data.content.reverse();data.content[0].props.enabled=false;
  const saved=fromLandingCanvas(value,data);
  expect(saved.sections).toEqual([{...value.sections[1],id:'legacy-1',enabled:false},{...value.sections[0],id:'legacy-0'}]);
  expect(fromLandingCanvas(saved,toLandingCanvas(saved))).toEqual(saved);
  const html=renderLandingHtml({title:saved.pageName,sections:saved.sections});expect(html).toContain('Apertura');expect(html).not.toContain('Custom');
 });
 it('exports escaped text and rejects arbitrary CSS through tokens',()=>{
  const html=renderLandingHtml({title:'<script>alert(1)</script>',designTokens:{accent:'red;}body{display:none}',font:'url(https://bad)'},sections:[{type:'hero',headline:'<img src=x onerror=alert(1)>',variant:'centered'}]});
  expect(html).not.toContain('<script>');expect(html).not.toContain('<img');expect(html).not.toContain('https://bad');expect(html).toContain('centered');
 });
 it('preserves theme presets across canvas roundtrip and renders theme styling',()=>{
  const value=toLanding({title:'Página Temática',designTokens:{theme:'dark',accent:'#6366f1'},sections:[{type:'hero',headline:'Oscuro Hero'},{type:'footer',headline:'Pie',copyright:'2026'}]});
  const canvas=toLandingCanvas(value);
  const restored=fromLandingCanvas(value,canvas);
  expect(restored.designTokens?.theme).toBe('dark');
  const html=renderLandingHtml(restored);
  expect(html).toContain('#0b0f19'); // dark bg token
  expect(html).toContain('Oscuro Hero');
 });
 it('generates standalone React component without Puck dependencies',()=>{
  const value={pageName:'Landing React',theme:'editorial',sections:[{type:'hero',headline:'Título TSX'},{type:'problem',headline:'Dolores'},{type:'offer',headline:'Oferta TSX',price:'$47',bonuses:[{title:'Bono 1'}]},{type:'cta',headline:'Comprar Ahora',cta:'Unirse'}]};
  const reactCode=renderLandingReactCode(value);
  expect(reactCode).toContain('export default function LandingPage');
  expect(reactCode).not.toContain('@measured/puck');
  expect(reactCode).toContain('Título TSX');
  expect(reactCode).toContain('Bono 1');
  expect(reactCode).toContain('$47');
  expect(reactCode).toContain('serif');
 });
 it('renders an accessible hero image and keeps the checkout CTA scoped to an HTTPS destination',()=>{
  const value={title:'Guía',sections:[{type:'hero',headline:'Paseos observables',imageUrl:'https://images.example.org/walk.webp',imageAlt:'Persona paseando con un perro',cta:'Conocer la guía'},{type:'offer',headline:'Contenido',cta:'Comprar'}],externalCheckout:{platform:'custom',checkoutUrl:'https://payments.example.org/guide'}};
  const html=renderLandingHtml(value);
  expect(html).toContain('src="https://images.example.org/walk.webp"');
  expect(html).toContain('alt="Persona paseando con un perro"');
  expect(html).toContain('href="#section-1"');
  expect(html).toContain('href="https://payments.example.org/guide"');
  const reactCode=renderLandingReactCode(value);
  expect(reactCode).toContain('imageUrl?: string');
  expect(reactCode).toContain('alt={section.imageAlt || ""}');
 });
 it('does not emit unsafe image, checkout or tracking URLs into exported HTML',()=>{
  const html=renderLandingHtml({title:'Seguro',sections:[{type:'hero',headline:'Inicio',imageUrl:'javascript:alert(1)',imageAlt:'Imagen',cta:'Ver oferta'},{type:'offer',headline:'Oferta',cta:'Comprar'}],externalCheckout:{platform:'custom',checkoutUrl:'javascript:alert(2)'},tracking:{metaPixel:{pixelId:"12345');alert(3)//"}}});
  expect(html).not.toContain('src="javascript:');
  expect(html).not.toContain('href="javascript:');
  expect(html).not.toContain('alert(3)');
 });
 it('keeps checkout settings through both editors and activates payment only for a configured platform',()=>{
  const source={title:'Guía',sections:[{type:'hero',headline:'Inicio',cta:'Ver oferta'},{type:'offer',headline:'Oferta',cta:'Comprar'}],externalCheckout:{platform:'hotmart',checkoutUrl:'https://pay.hotmart.com/example',productSku:'sku-1'}};
  const value=toLanding(source);
  const saved=fromLanding(source,fromLandingCanvas(value,toLandingCanvas(value)));
  expect(saved.externalCheckout).toEqual(source.externalCheckout);
  expect(renderLandingHtml(saved)).toContain('href="https://pay.hotmart.com/example"');
  expect(renderLandingHtml({...saved,externalCheckout:{...source.externalCheckout,platform:'none'}})).not.toContain('href="https://pay.hotmart.com/example"');
  expect(renderLandingHtml({...saved,externalCheckout:{platform:'custom',checkoutUrl:'https://user:pass@evil.test/'}})).not.toContain('href="https://user:pass@evil.test/"');
 });
 it('does not render a dead purchase link in the offer when checkout is unavailable',()=>{
  const value={title:'Guía',sections:[{type:'hero',cta:'Ver oferta'},{type:'offer',headline:'Oferta',cta:'Comprar'}]};
  const html=renderLandingHtml(value);
  expect(html).toContain('href="#section-1"');
  expect(html).not.toContain('>Comprar</a>');
  expect(renderLandingHtml({...value,externalCheckout:{platform:'custom',checkoutUrl:'https://pay.example.org/guide'}})).toContain('href="https://pay.example.org/guide"');
 });
});
