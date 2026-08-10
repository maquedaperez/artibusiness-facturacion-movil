import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MfaPage } from './mfa.page';

describe('MfaPage', () => {
  let component: MfaPage;
  let fixture: ComponentFixture<MfaPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(MfaPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
