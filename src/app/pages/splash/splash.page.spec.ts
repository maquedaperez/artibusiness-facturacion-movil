import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { Router } from '@angular/router';
import { SplashPage } from './splash.page';
import { AuthService } from '../../services/auth.service';
import { TenantService } from '../../services/tenant.service';

describe('SplashPage', () => {
  let component: SplashPage;
  let fixture: ComponentFixture<SplashPage>;
  let navegar: jasmine.Spy;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SplashPage, RouterTestingModule],
    });
    fixture = TestBed.createComponent(SplashPage);
    component = fixture.componentInstance;
    navegar = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('con sesion abierta entra directo a la app', fakeAsync(() => {
    spyOn(TestBed.inject(AuthService), 'isLoggedIn').and.returnValue(true);

    fixture.detectChanges();
    tick(1200);

    expect(navegar).toHaveBeenCalledWith('/app', { replaceUrl: true });
  }));

  it('sin sesion pero con clave de empresa, al login', fakeAsync(() => {
    spyOn(TestBed.inject(AuthService), 'isLoggedIn').and.returnValue(false);
    spyOn(TestBed.inject(TenantService), 'getTenantKey').and.resolveTo('demo');

    fixture.detectChanges();
    tick(1200);

    expect(navegar).toHaveBeenCalledWith('/login', { replaceUrl: true });
  }));

  // ANTES SE QUEDABA AQUI PARA SIEMPRE: la promesa se rompia dentro del setTimeout, nadie la
  // recogia y la app no salia nunca del logo.
  it('si no se pueden leer las preferencias, va a /setup en vez de quedarse colgada', fakeAsync(() => {
    spyOn(TestBed.inject(AuthService), 'isLoggedIn').and.returnValue(false);
    spyOn(TestBed.inject(TenantService), 'getTenantKey').and.rejectWith(new Error('almacenamiento bloqueado'));

    fixture.detectChanges();
    tick(1200);

    expect(navegar).toHaveBeenCalledWith('/setup', { replaceUrl: true });
  }));

  it('al salir de la pantalla antes de tiempo ya no navega', fakeAsync(() => {
    spyOn(TestBed.inject(AuthService), 'isLoggedIn').and.returnValue(true);

    fixture.detectChanges();
    fixture.destroy();
    tick(1200);

    expect(navegar).not.toHaveBeenCalled();
  }));
});
