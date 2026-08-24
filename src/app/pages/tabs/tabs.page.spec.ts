import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TabsPage } from './tabs.page';
import { provideTranslocoTesting } from '../../core/i18n/testing/transloco-testing.providers';

describe('TabsPage', () => {
  let component: TabsPage;
  let fixture: ComponentFixture<TabsPage>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TabsPage, RouterTestingModule],
      providers: [...provideTranslocoTesting()],
    });
    fixture = TestBed.createComponent(TabsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
