package auth

import (
	"context"
	"net/http"

	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
)

const CookieName = "auth"

type ctxKey int

const claimsKey ctxKey = 1

func Middleware(j *JWT) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			c, err := r.Cookie(CookieName)
			if err != nil || c.Value == "" {
				httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Sesi tidak ditemukan")
				return
			}
			claims, err := j.Verify(c.Value)
			if err != nil {
				httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Sesi tidak valid atau telah berakhir")
				return
			}
			ctx := ContextWithClaims(r.Context(), claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func RequireRole(role model.Role) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			c, ok := ClaimsFrom(r.Context())
			if !ok || c.Role != role {
				httpx.Error(w, http.StatusForbidden, "forbidden", "Akses tidak diizinkan")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func ClaimsFrom(ctx context.Context) (*Claims, bool) {
	c, ok := ctx.Value(claimsKey).(*Claims)
	return c, ok
}

// ContextWithClaims returns a child context carrying the given claims. Used by
// Middleware and by tests/handlers that need to set claims directly.
func ContextWithClaims(ctx context.Context, c *Claims) context.Context {
	return context.WithValue(ctx, claimsKey, c)
}

// RequireAnyRole allows the request through if the caller's role matches any of
// the given roles; otherwise 403.
func RequireAnyRole(roles ...model.Role) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			c, ok := ClaimsFrom(r.Context())
			if !ok || c == nil {
				httpx.Error(w, http.StatusForbidden, "forbidden", "Akses tidak diizinkan")
				return
			}
			for _, role := range roles {
				if c.Role == role {
					next.ServeHTTP(w, r)
					return
				}
			}
			httpx.Error(w, http.StatusForbidden, "forbidden", "Akses tidak diizinkan")
		})
	}
}
