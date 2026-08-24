import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SetupPage } from './setup.page';
import { provideTranslocoTesting } from '../../core/i18n/testing/transloco-testing.providers';

describe('SetupPage', () => {
  let component: SetupPage;
  let fixture: ComponentFixture<SetupPage>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...provideTranslocoTesting()],
    });
    fixture = TestBed.createComponent(SetupPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
