import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { DatosEmisorPage } from './datos-emisor.page';
import { MOCK_REPOSITORY_PROVIDERS } from '../../core/providers/mock.providers';

describe('DatosEmisorPage', () => {
  let component: DatosEmisorPage;
  let fixture: ComponentFixture<DatosEmisorPage>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DatosEmisorPage, RouterTestingModule],
      providers: [...MOCK_REPOSITORY_PROVIDERS],
    });
    fixture = TestBed.createComponent(DatosEmisorPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
