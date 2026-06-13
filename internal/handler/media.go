package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/fadhilkurnia/ppg-dashboard/internal/auth"
	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

// embedURL converts a raw watch/share URL to an embeddable iframe src.
// Supported conversions:
//   - YouTube watch/short/youtu.be  → https://www.youtube.com/embed/<id>
//   - Google Slides presentation    → https://docs.google.com/presentation/d/<id>/embed
//   - Canva design /view or /watch  → original URL + ?embed (if not already present)
//
// Any other URL is returned unchanged. The function never panics.
func embedURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return raw
	}

	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}

	host := strings.ToLower(u.Host)

	// ── YouTube ──────────────────────────────────────────────────────────────
	// https://www.youtube.com/watch?v=ID
	// https://www.youtube.com/shorts/ID
	// https://youtu.be/ID
	if host == "www.youtube.com" || host == "youtube.com" || host == "youtu.be" {
		id := youtubeID(u)
		if id != "" {
			return "https://www.youtube.com/embed/" + id
		}
		return raw
	}

	// ── Google Slides ─────────────────────────────────────────────────────────
	// https://docs.google.com/presentation/d/<id>/edit  (or /view, /pub, etc.)
	if host == "docs.google.com" {
		re := regexp.MustCompile(`/presentation/d/([^/]+)`)
		m := re.FindStringSubmatch(u.Path)
		if len(m) == 2 {
			return "https://docs.google.com/presentation/d/" + m[1] + "/embed"
		}
		return raw
	}

	// ── Canva ─────────────────────────────────────────────────────────────────
	// https://www.canva.com/design/<slug>/view  (or /watch)
	if host == "www.canva.com" || host == "canva.com" {
		// Already has ?embed or embed in query — leave it.
		if strings.Contains(u.RawQuery, "embed") {
			return raw
		}
		// Append ?embed.
		if u.RawQuery == "" {
			return raw + "?embed"
		}
		return raw + "&embed"
	}

	return raw
}

// youtubeID extracts the video ID from a parsed YouTube URL.
func youtubeID(u *url.URL) string {
	host := strings.ToLower(u.Host)
	// youtu.be/<id>
	if host == "youtu.be" {
		id := strings.TrimPrefix(u.Path, "/")
		if id != "" {
			return id
		}
		return ""
	}
	// /shorts/<id>
	re := regexp.MustCompile(`^/shorts/([^/?#]+)`)
	if m := re.FindStringSubmatch(u.Path); len(m) == 2 {
		return m[1]
	}
	// /watch?v=<id>
	return u.Query().Get("v")
}

// ── Handler ───────────────────────────────────────────────────────────────────

// Media is the handler for /library/media CRUD.
type Media struct {
	s *store.LibraryMediaStore
}

func NewMedia(s *store.LibraryMediaStore) *Media { return &Media{s: s} }

// isAdminOrGuru returns true when the authenticated caller is admin or guru.
func isAdminOrGuru(r *http.Request) bool {
	c, ok := auth.ClaimsFrom(r.Context())
	if !ok {
		return false
	}
	switch string(c.Role) {
	case "admin", "guru":
		return true
	}
	return false
}

// mediaItem is the JSON shape returned by List/Create/Update — stored fields
// plus the computed embedUrl.
type mediaItem struct {
	ID          string  `json:"id"`
	Type        string  `json:"type"`
	Title       string  `json:"title"`
	URL         string  `json:"url"`
	EmbedURL    string  `json:"embedUrl"`
	Description *string `json:"description,omitempty"`
	CreatedBy   *string `json:"createdBy,omitempty"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
}

func toMediaItem(m store.LibraryMedia) mediaItem {
	return mediaItem{
		ID:          m.ID,
		Type:        m.Type,
		Title:       m.Title,
		URL:         m.URL,
		EmbedURL:    embedURL(m.URL),
		Description: m.Description,
		CreatedBy:   m.CreatedBy,
		CreatedAt:   m.CreatedAt,
		UpdatedAt:   m.UpdatedAt,
	}
}

func (h *Media) List(w http.ResponseWriter, r *http.Request) {
	list, err := h.s.List(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memuat library media")
		return
	}
	out := make([]mediaItem, 0, len(list))
	for _, m := range list {
		out = append(out, toMediaItem(m))
	}
	httpx.JSON(w, http.StatusOK, out)
}

type mediaCreateBody struct {
	Type        string  `json:"type"`
	Title       string  `json:"title"`
	URL         string  `json:"url"`
	Description *string `json:"description,omitempty"`
}

func (h *Media) Create(w http.ResponseWriter, r *http.Request) {
	if !isAdminOrGuru(r) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "hanya admin atau guru")
		return
	}
	var b mediaCreateBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "format salah")
		return
	}
	b.Type = strings.TrimSpace(b.Type)
	b.Title = strings.TrimSpace(b.Title)
	b.URL = strings.TrimSpace(b.URL)
	if b.Type != "ppt" && b.Type != "video" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "type harus ppt atau video")
		return
	}
	if b.Title == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "title wajib diisi")
		return
	}
	if b.URL == "" || len(b.URL) > 2000 {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "url wajib diisi (maks 2000 karakter)")
		return
	}
	c, _ := auth.ClaimsFrom(r.Context())
	createdBy := c.UserID
	m, err := h.s.Create(r.Context(), store.LibraryMediaInput{
		Type:        b.Type,
		Title:       b.Title,
		URL:         b.URL,
		Description: trimPtr(b.Description),
		CreatedBy:   &createdBy,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menyimpan media")
		return
	}
	httpx.JSON(w, http.StatusCreated, toMediaItem(*m))
}

type mediaUpdateBody struct {
	Type        *string `json:"type,omitempty"`
	Title       *string `json:"title,omitempty"`
	URL         *string `json:"url,omitempty"`
	Description *string `json:"description,omitempty"`
}

func (h *Media) Update(w http.ResponseWriter, r *http.Request) {
	if !isAdminOrGuru(r) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "hanya admin atau guru")
		return
	}
	id := chi.URLParam(r, "id")
	var b mediaUpdateBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "format salah")
		return
	}
	in := store.LibraryMediaInput{}
	if b.Type != nil {
		t := strings.TrimSpace(*b.Type)
		if t != "ppt" && t != "video" {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "type harus ppt atau video")
			return
		}
		in.Type = t
	}
	if b.Title != nil {
		in.Title = strings.TrimSpace(*b.Title)
	}
	if b.URL != nil {
		u := strings.TrimSpace(*b.URL)
		if len(u) > 2000 {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "url maks 2000 karakter")
			return
		}
		in.URL = u
	}
	if b.Description != nil {
		in.Description = trimPtr(b.Description)
	}
	m, err := h.s.Update(r.Context(), id, in)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Media tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui media")
		return
	}
	httpx.JSON(w, http.StatusOK, toMediaItem(*m))
}

func (h *Media) Delete(w http.ResponseWriter, r *http.Request) {
	if !isAdminOrGuru(r) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "hanya admin atau guru")
		return
	}
	id := chi.URLParam(r, "id")
	if err := h.s.Delete(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Media tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghapus media")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}
