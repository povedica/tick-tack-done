import path from 'node:path';
import {expect,test} from '@playwright/test';
import {r80Fixture} from './r80.fixture';
test('TTD-AUD-97: two cards show granted permission and local activation separately; revocation affects both',async({page},info)=>{
 await r80Fixture(page,{drive:true});let revoked=false;let driveEnabled=true;let removals=0;
 await page.route('**/api/v1/integrations/google',async route=>{
  if(route.request().method()==='DELETE'){revoked=true;removals++;return route.fulfill({status:204});}
  return route.fulfill({json:{configured:true,has_connection:!revoked,authorized:!revoked,enabled:true,connected:!revoked,status:revoked?'disconnected':'connected',account:'synthetic@example.test'}});
 });
 await page.route('**/api/v1/integrations/drive',route=>route.fulfill({json:{configured:true,authorized:!revoked,enabled:driveEnabled,connected:!revoked&&driveEnabled,status:revoked?'disconnected':driveEnabled?'connected':'disabled',account:'synthetic@example.test'}}));
 await page.route('**/api/v1/integrations/google/services/drive',route=>{driveEnabled=route.request().postDataJSON().enabled;return route.fulfill({json:{authorized:true,enabled:driveEnabled,status:driveEnabled?'connected':'disabled'}});});
 await page.goto('/settings/integrations');const calendar=page.locator('section[aria-labelledby=google-title]');const drive=page.locator('section[aria-labelledby=drive-title]');
 await expect(calendar).toContainText('Autorizado · Activo');await expect(drive).toContainText('Autorizado · Activo');await expect(drive).toContainText('sin guardar los ficheros en su servidor');
 await drive.getByRole('button',{name:'Desactivar Google Drive',exact:true}).click();await expect(drive).toContainText('Autorizado · Desactivado');await expect(calendar).toContainText('Autorizado · Activo');expect(removals).toBe(0);
 await drive.getByRole('button',{name:'Activar Google Drive',exact:true}).click();await expect(drive).toContainText('Autorizado · Activo');
 const theme=info.project.name.endsWith('dark')?'dark':'light';await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);const phase=process.env.R80_PHASE ?? 'antes';
 const capture=(name:string)=>page.screenshot({path:path.resolve('../../docs/audit/evidencias/r80',`97_${name}_${phase}_${info.project.name.replace('-','_')}.png`),animations:'disabled'});
 await capture('google');await page.getByRole('button',{name:'Revocar acceso a Google',exact:true}).click();const dialog=page.getByRole('alertdialog',{name:'Revocar acceso a Google'});await expect(dialog).toContainText('Ambos servicios');await capture('confirmacion');
 await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();expect(removals).toBe(0);
 await page.getByRole('button',{name:'Revocar acceso a Google',exact:true}).click();await dialog.getByRole('button',{name:'Revocar acceso a Google',exact:true}).click();await expect(calendar).toContainText('Desconectado');await expect(drive).toContainText('Desconectado');expect(removals).toBe(1);
 await page.goto('/today?task=task');await expect(page.locator('.attachment-chip')).toHaveAttribute('href','https://drive.google.com/file/d/synthetic/view');await expect(page.locator('.detail-attach-btn')).toBeDisabled();
});
test('TTD-AUD-97: a missing Drive permission offers incremental authorization through the shared Google client',async({page})=>{
 await r80Fixture(page,{drive:true});let requested='';
 await page.route('**/api/v1/integrations/drive',route=>route.fulfill({json:{configured:true,authorized:false,enabled:true,connected:false,status:'permission_required',account:'synthetic@example.test'}}));
 await page.route('**/api/v1/integrations/google/start?**',route=>{requested=new URL(route.request().url()).searchParams.get('service') ?? '';return route.fulfill({json:{url:'https://accounts.google.com/o/oauth2/v2/auth?client_id=shared&scope=drive.file'}});});
 await page.route('https://accounts.google.com/**',route=>route.fulfill({body:'Synthetic Google consent',contentType:'text/html'}));
 await page.goto('/settings/integrations');const drive=page.locator('section[aria-labelledby=drive-title]');await expect(drive).toContainText('Sin permiso');await expect(page.locator('section[aria-labelledby=google-title]')).toContainText('Autorizado · Activo');await drive.getByRole('button',{name:'Autorizar Google Drive',exact:true}).click();await expect.poll(()=>requested).toBe('drive');await expect(page).toHaveURL(/accounts.google.com/);
});

for(const [status,label,button] of [['permissions_unknown','Permisos por comprobar','Autorizar Google Drive'],['reauth_required','Autorización caducada o revocada','Reconectar Google Drive']] as const) test(`TTD-AUD-97: ${status} is distinct from connected`,async({page})=>{
 await r80Fixture(page,{drive:true});await page.route('**/api/v1/integrations/drive',route=>route.fulfill({json:{configured:true,authorized:false,enabled:true,connected:false,status}}));
 await page.goto('/settings/integrations');const drive=page.locator('section[aria-labelledby=drive-title]');await expect(drive).toContainText(label);await expect(drive.getByRole('button',{name:button,exact:true})).toBeVisible();await expect(drive.getByRole('button',{name:'Desactivar Google Drive'})).toHaveCount(0);
});
test('TTD-AUD-97: changing permissions confirms shared revocation before new Google consent',async({page})=>{
 await r80Fixture(page,{drive:true});const steps:string[]=[];
 await page.route('**/api/v1/integrations/google',route=>{if(route.request().method()==='DELETE'){steps.push('revoke');return route.fulfill({status:204});}return route.fulfill({json:{configured:true,has_connection:true,authorized:true,enabled:true,connected:true,status:'connected'}});});
 await page.route('**/api/v1/integrations/google/start?**',route=>{steps.push(`authorize:${new URL(route.request().url()).searchParams.get('service')}`);return route.fulfill({json:{url:'https://accounts.google.com/o/oauth2/v2/auth?client_id=shared'}});});
 await page.route('https://accounts.google.com/**',route=>route.fulfill({body:'Synthetic consent',contentType:'text/html'}));
 await page.goto('/settings/integrations');await page.getByRole('button',{name:'Cambiar permisos',exact:true}).click();const dialog=page.getByRole('alertdialog',{name:'Cambiar permisos'});await expect(dialog).toContainText('Ambos servicios se interrumpen');await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();expect(steps).toEqual([]);
 await page.getByRole('button',{name:'Cambiar permisos',exact:true}).click();await dialog.getByRole('button',{name:'Revocar y elegir permisos',exact:true}).click();await expect(page).toHaveURL(/accounts.google.com/);expect(steps).toEqual(['revoke','authorize:all']);
});
