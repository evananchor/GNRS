package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"
	"github.com/oklog/ulid/v2"

	"github.com/fadhilkurnia/ppg-dashboard/internal/auth"
	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

// Murid is the wali/admin-scoped student endpoint. It deliberately exposes only
// safe profile fields plus ortu links — never role, password, or login identity.
type Murid struct {
	users     *store.Users
	kelas     *store.KelasStore
	validator *validator.Validate
}

func NewMurid(users *store.Users, kelas *store.KelasStore) *Murid {
	return &Murid{users: users, kelas: kelas, validator: validator.New()}
}

// canManageMurid authorizes admin OR the wali of a class the murid is in.
// Returns false (and writes the response) when unauthorized or target missing.
func (h *Murid) canManageMurid(w http.ResponseWriter, r *http.Request, id string) bool {
	target, err := h.users.FindByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Murid tidak ditemukan")
		} else {
			httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil data murid")
		}
		return false
	}
	if target.Role != model.RoleMurid {
		httpx.Error(w, http.StatusNotFound, "not_found", "Murid tidak ditemukan")
		return false
	}
	claims, ok := auth.ClaimsFrom(r.Context())
	if !ok || claims == nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Sesi tidak ditemukan")
		return false
	}
	if claims.Role == model.RoleAdmin {
		return true
	}
	isWali, err := h.kelas.IsWaliOfMurid(r.Context(), claims.UserID, id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memeriksa hak akses")
		return false
	}
	if !isWali {
		httpx.Error(w, http.StatusForbidden, "forbidden", "Akses tidak diizinkan")
		return false
	}
	return true
}

func (h *Murid) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !h.canManageMurid(w, r, id) {
		return
	}
	u, err := h.users.FindByID(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil data murid")
		return
	}
	links, err := h.users.GetMuridOrtu(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "ortu_fetch", err.Error())
		return
	}
	u.Ortu = links
	httpx.JSON(w, http.StatusOK, u)
}

// muridUpdateBody is the whitelist: only safe profile fields + ortu links.
// SECURITY: no role/active/email/username/password/userCode fields.
type muridUpdateBody struct {
	Name        *string `json:"name,omitempty"        validate:"omitempty,max=200"`
	Nickname    *string `json:"nickname,omitempty"    validate:"omitempty,max=200"`
	DateOfBirth *string `json:"dateOfBirth,omitempty"`
	Gender      *string `json:"gender,omitempty"      validate:"omitempty,oneof=male female"`
	NoHP        *string `json:"noHp,omitempty"        validate:"omitempty,max=64"`
	PhoneRegion *string `json:"phoneRegion,omitempty" validate:"omitempty,oneof=ID SG US CA"`
	Alamat      *string `json:"alamat,omitempty"      validate:"omitempty,max=500"`
	Level       *string `json:"level,omitempty"`
	TempatLahir *string `json:"tempatLahir,omitempty" validate:"omitempty,max=120"`
	Notes       *string `json:"notes,omitempty"       validate:"omitempty,max=2000"`

	AyahID      *string `json:"ayahId,omitempty"`
	ClearAyahID bool    `json:"clearAyahId,omitempty"`
	IbuID       *string `json:"ibuId,omitempty"`
	ClearIbuID  bool    `json:"clearIbuId,omitempty"`
}

func (h *Murid) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !h.canManageMurid(w, r, id) {
		return
	}
	var b muridUpdateBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format permintaan tidak valid")
		return
	}
	if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	in := store.UserUpdateInput{
		Name:        b.Name,
		Nickname:    b.Nickname,
		NoHP:        b.NoHP,
		Alamat:      b.Alamat,
		PhoneRegion: b.PhoneRegion,
		TempatLahir: b.TempatLahir,
		Notes:       b.Notes,
		Gender:      b.Gender,
	}
	if b.Level != nil {
		if *b.Level == "" {
			in.ClearLevel = true
		} else if isValidLevel(*b.Level) {
			lvl := model.StudentLevel(*b.Level)
			in.Level = &lvl
		} else {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "Level tidak valid")
			return
		}
	}
	if b.DateOfBirth != nil {
		if *b.DateOfBirth == "" {
			in.ClearDateOfBirth = true
		} else if d, ok := parseOptDate(b.DateOfBirth); ok && d != nil {
			in.DateOfBirth = d
		} else {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "Format tanggal lahir tidak valid (YYYY-MM-DD)")
			return
		}
	}

	u, err := h.users.Update(r.Context(), id, in)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Murid tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui murid")
		return
	}

	if b.ClearAyahID {
		_ = h.users.RemoveMuridOrtu(r.Context(), id, "ayah")
	} else if b.AyahID != nil && *b.AyahID != "" {
		if err := h.users.SetMuridOrtu(r.Context(), id, "ayah", *b.AyahID); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghubungkan ortu ayah")
			return
		}
	}
	if b.ClearIbuID {
		_ = h.users.RemoveMuridOrtu(r.Context(), id, "ibu")
	} else if b.IbuID != nil && *b.IbuID != "" {
		if err := h.users.SetMuridOrtu(r.Context(), id, "ibu", *b.IbuID); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghubungkan ortu ibu")
			return
		}
	}
	links, err := h.users.GetMuridOrtu(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "ortu_fetch", err.Error())
		return
	}
	u.Ortu = links
	httpx.JSON(w, http.StatusOK, u)
}

func (h *Murid) SearchOrtu(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	res, err := h.users.List(r.Context(), store.UserListParams{
		Query: strings.TrimSpace(q.Get("q")),
		Role:  string(model.RoleOrtu),
		Limit: limit,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mencari ortu")
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

type ortuCreateBody struct {
	Name        string  `json:"name"                  validate:"required,max=200"`
	NoHP        *string `json:"noHp,omitempty"        validate:"omitempty,max=64"`
	PhoneRegion *string `json:"phoneRegion,omitempty" validate:"omitempty,oneof=ID SG US CA"`
}

func (h *Murid) CreateOrtu(w http.ResponseWriter, r *http.Request) {
	var b ortuCreateBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format permintaan tidak valid")
		return
	}
	b.Name = strings.TrimSpace(b.Name)
	if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	region := "ID"
	if b.PhoneRegion != nil && *b.PhoneRegion != "" {
		region = *b.PhoneRegion
	}
	in := store.UserCreateInput{
		Email:       "ortu." + ulid.Make().String() + "@placeholder.local",
		Name:        b.Name,
		Password:    ulid.Make().String(), // unusable placeholder; ortu has no login UI
		Role:        model.RoleOrtu,       // forced — never trust the client
		NoHP:        b.NoHP,
		PhoneRegion: region,
	}
	u, err := h.users.Create(r.Context(), in)
	if err != nil {
		if isUniqueConflict(err) {
			httpx.Error(w, http.StatusConflict, "conflict", "Ortu sudah terdaftar")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menyimpan ortu")
		return
	}
	httpx.JSON(w, http.StatusCreated, u)
}
