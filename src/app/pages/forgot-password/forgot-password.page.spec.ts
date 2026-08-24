import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ForgotPasswordPage } from './forgot-password.page';
import { provideTranslocoTesting } from '../../core/i18n/testing/transloco-testing.providers';

describe('ForgotPasswordPage', () => {
  let component: ForgotPasswordPage;
  let fixture: ComponentFixture<ForgotPasswordPage>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ForgotPasswordPage, RouterTestingModule],
      providers: [...provideTranslocoTesting()],
    });
    fixture = TestBed.createComponent(ForgotPasswordPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
