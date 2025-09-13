import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ProductService } from '../../services/product.service';
import { NgIf } from '@angular/common';

@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, NgIf],
  templateUrl: './product-form.component.html',
  styleUrl: './product-form.component.css'
})
export class ProductFormComponent {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ProductService);

  id = this.route.snapshot.paramMap.get('id');
  isEdit = signal(!!this.id);
  saving = signal(false);
  errorMsg = signal<string | null>(null);

  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    price: [0, [Validators.required]]
  });

  constructor() {
    if (this.isEdit()) {
      this.api.get(this.id!).subscribe({
        next: p => this.form.patchValue({ name: p.name, price: p.price }),
        error: e => this.errorMsg.set(e?.error?.error || 'Failed to load')
      });
    }
  }

  submit() {
    this.errorMsg.set(null);
    if (this.form.invalid) { this.errorMsg.set('Fill all fields'); return; }
    this.saving.set(true);
    const payload = {
      name: this.form.value.name!,
      price: Number(this.form.value.price)
    };
    const done = () => this.router.navigate(['/products']);
    const fail = (e: any) => {
      console.error(e);
      this.errorMsg.set(e?.error?.error || 'Request failed');
      this.saving.set(false);
    };

    if (this.isEdit()) {
      this.api.update(this.id!, payload).subscribe({ next: done, error: fail });
    } else {
      this.api.create(payload).subscribe({ next: done, error: fail });
    }
  }
}
