import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { documentTextOutline, receiptOutline, personOutline } from 'ionicons/icons';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslocoPipe, IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel],
})
export class TabsPage implements OnInit, OnDestroy {
  private observer?: MutationObserver;

  constructor() {
    addIcons({ documentTextOutline, receiptOutline, personOutline });
  }

  ngOnInit() {
    const tabBar = document.querySelector('ion-tab-bar');
    if (!tabBar) return;

    // ✅ Vigila si Ionic añade tab-bar-hidden y la elimina inmediatamente
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation: MutationRecord) => {
        const target = mutation.target as HTMLElement;
        if (target.classList.contains('tab-bar-hidden')) {
          target.classList.remove('tab-bar-hidden');
        }
      });
    });

    this.observer.observe(tabBar, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  ngOnDestroy() {
    this.observer?.disconnect();
  }
}