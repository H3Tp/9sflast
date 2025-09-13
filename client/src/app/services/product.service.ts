import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export type Product = { _id?: string; name: string; price: number };

@Injectable({ providedIn: 'root' })
export class ProductService {
  private http = inject(HttpClient);
  private API = 'http://localhost:3000/api/products';

  list(): Observable<Product[]> { return this.http.get<Product[]>(this.API); }
  get(id: string): Observable<Product> { return this.http.get<Product>(`${this.API}/${id}`); }
  create(p: Product): Observable<Product> { return this.http.post<Product>(this.API, p).pipe(tap(()=>console.log('POST /products', p))); }
  update(id: string, p: Partial<Product>): Observable<Product> { return this.http.put<Product>(`${this.API}/${id}`, p).pipe(tap(()=>console.log('PUT /products/'+id, p))); }
  remove(id: string): Observable<{ ok: boolean }> { return this.http.delete<{ ok: boolean }>(`${this.API}/${id}`).pipe(tap(()=>console.log('DELETE /products/'+id))); }
}
