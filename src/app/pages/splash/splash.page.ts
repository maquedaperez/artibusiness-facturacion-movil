import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonSpinner } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { TenantService } from '../../services/tenant.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-splash',
  templateUrl: './splash.page.html',
  styleUrls: ['./splash.page.scss'],
  standalone: true,
  imports: [IonSpinner, IonContent, CommonModule, FormsModule],
})
export class SplashPage implements OnInit {
  private tenant = inject(TenantService);
  private auth = inject(AuthService);
  private router = inject(Router);


  ngOnInit() {
    setTimeout(async () => {
      if (this.auth.isLoggedIn()) {
        await this.router.navigateByUrl('/app', { replaceUrl: true });
        return;
      }
      const key = (await this.tenant.getTenantKey())?.trim();
      if (!key) {
        await this.router.navigateByUrl('/setup', { replaceUrl: true });
        return;
      }
      await this.router.navigateByUrl('/login', { replaceUrl: true });
    }, 1200);
  }
}