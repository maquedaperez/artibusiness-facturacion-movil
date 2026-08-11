import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { MfaPage } from './mfa.page';

describe('MfaPage', () => {
  let component: MfaPage;
  let fixture: ComponentFixture<MfaPage>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MfaPage, RouterTestingModule],
    });
    fixture = TestBed.createComponent(MfaPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
