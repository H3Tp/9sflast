import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'products', pathMatch: 'full' },
  { path: 'products', loadComponent: () => import('./pages/products/products.component').then(m => m.ProductsComponent) },
  { path: 'products/new', loadComponent: () => import('./pages/product-form/product-form.component').then(m => m.ProductFormComponent) },
  { path: 'products/:id/edit', loadComponent: () => import('./pages/product-form/product-form.component').then(m => m.ProductFormComponent) },
  { path: '**', redirectTo: 'products' }
];
