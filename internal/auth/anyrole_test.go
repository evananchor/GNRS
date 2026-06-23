package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
)

func TestRequireAnyRole(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })
	mw := RequireAnyRole(model.RoleAdmin, model.RoleGuru)

	cases := []struct {
		role model.Role
		want int
	}{
		{model.RoleAdmin, http.StatusOK},
		{model.RoleGuru, http.StatusOK},
		{model.RoleMurid, http.StatusForbidden},
	}
	for _, c := range cases {
		req := httptest.NewRequest("GET", "/", nil)
		req = req.WithContext(ContextWithClaims(req.Context(), &Claims{UserID: "u1", Role: c.role}))
		rr := httptest.NewRecorder()
		mw(next).ServeHTTP(rr, req)
		if rr.Code != c.want {
			t.Fatalf("role %s: got %d want %d", c.role, rr.Code, c.want)
		}
	}

	// No claims at all → forbidden.
	rr := httptest.NewRecorder()
	mw(next).ServeHTTP(rr, httptest.NewRequest("GET", "/", nil))
	if rr.Code != http.StatusForbidden {
		t.Fatalf("no claims: got %d want 403", rr.Code)
	}
	_ = context.Background()
}
