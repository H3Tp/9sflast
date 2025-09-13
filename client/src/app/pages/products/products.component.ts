import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductService, Product } from '../../services/product.service';
import { NgIf, NgFor } from '@angular/common';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [RouterLink, NgIf, NgFor],
  templateUrl: './products.component.html',
  styleUrl: './products.component.css'
})
export class ProductsComponent {
  private api = inject(ProductService);
  items = signal<Product[]>([]);
  loading = signal(true);

  constructor() { this.refresh(); }

  refresh() {
    this.loading.set(true);
    this.api.list().subscribe({
      next: d => { this.items.set(d); this.loading.set(false); },
      error: () => { this.items.set([]); this.loading.set(false); }
    });
  }

  delete(id: string) {
    if (!confirm('Delete this product?')) return;
    this.api.remove(id).subscribe(() => this.refresh());
  }
}
