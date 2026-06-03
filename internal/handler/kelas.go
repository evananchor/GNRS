package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"

	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

type Kelas struct {
	k         *store.KelasStore
	validator *validator.Validate
}

func NewKelas(k *store.KelasStore) *Kelas {
	return &Kelas{k: k, validator: validator.New()}
}

type kelasBody struct {
	Nama        string   `json:"nama"        validate:"required,max=200"`
	Tingkat     string   `json:"tingkat"     validate:"required,max=100"`
	GuruUserID  *string  `json:"guruUserId,omitempty"`
	GuruUserIDs []string `json:"guruUserIds,omitempty"`
	Tahun       int      `json:"tahun"       validate:"omitempty,gte=2000,lte=2200"`
	Deskripsi   *string  `json:"deskripsi,omitempty"`
}

func (h *Kelas) parse(r *http.Request) (store.KelasInput, error) {
	var b kelasBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		return store.KelasInput{}, errBadJSON
	}
	if err := h.validator.Struct(b); err != nil {
		return store.KelasInput{}, err
	}
	return store.KelasInput{
		Nama:        strings.TrimSpace(b.Nama),
		Tingkat:     strings.TrimSpace(b.Tingkat),
		GuruUserID:  trimPtr(b.GuruUserID),
		GuruUserIDs: b.GuruUserIDs,
		Tahun:       b.Tahun,
		Deskripsi:   trimPtr(b.Deskripsi),
	}, nil
}

func (h *Kelas) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	tahun, _ := strconv.Atoi(q.Get("tahun"))
	list, err := h.k.List(r.Context(), store.KelasListParams{
		Tingkat: strings.TrimSpace(q.Get("tingkat")),
		Tahun:   tahun,
		GuruID:  strings.TrimSpace(q.Get("guruId")),
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil daftar kelas")
		return
	}
	httpx.JSON(w, http.StatusOK, list)
}

func (h *Kelas) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	k, err := h.k.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Kelas tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil kelas")
		return
	}
	httpx.JSON(w, http.StatusOK, k)
}

func (h *Kelas) Create(w http.ResponseWriter, r *http.Request) {
	in, err := h.parse(r)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	k, err := h.k.Create(r.Context(), in)
	if err != nil {
		if isUniqueViolation(err) {
			httpx.Error(w, http.StatusConflict, "conflict", "Nama kelas sudah dipakai untuk tahun yang sama")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menyimpan kelas")
		return
	}
	httpx.JSON(w, http.StatusCreated, k)
}

func (h *Kelas) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	in, err := h.parse(r)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	k, err := h.k.Update(r.Context(), id, in)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Kelas tidak ditemukan")
			return
		}
		if isUniqueViolation(err) {
			httpx.Error(w, http.StatusConflict, "conflict", "Nama kelas sudah dipakai untuk tahun yang sama")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui kelas")
		return
	}
	httpx.JSON(w, http.StatusOK, k)
}

func (h *Kelas) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.k.Delete(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Kelas tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghapus kelas")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

// ---- Anggota ------------------------------------------------------------

func (h *Kelas) ListAnggota(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	list, err := h.k.ListAnggota(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil daftar anggota")
		return
	}
	httpx.JSON(w, http.StatusOK, list)
}

type anggotaBody struct {
	MuridIDs []string `json:"muridIds" validate:"required,min=1"`
}

func (h *Kelas) AddAnggota(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var b anggotaBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format permintaan tidak valid")
		return
	}
	if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if err := h.k.AddAnggota(r.Context(), id, b.MuridIDs); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menambah anggota")
		return
	}
	list, _ := h.k.ListAnggota(r.Context(), id)
	httpx.JSON(w, http.StatusOK, list)
}

func (h *Kelas) RemoveAnggota(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	muridID := chi.URLParam(r, "muridId")
	if err := h.k.RemoveAnggota(r.Context(), id, muridID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghapus anggota")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

// ---- Guru anggota -------------------------------------------------------

type guruAnggotaBody struct {
	GuruIDs []string `json:"guruIds" validate:"required,min=1"`
}

func (h *Kelas) ListGuruAnggota(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	list, err := h.k.ListGuruAnggota(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Kelas tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil daftar guru")
		return
	}
	httpx.JSON(w, http.StatusOK, list)
}

func (h *Kelas) AddGuruAnggota(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var b guruAnggotaBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format permintaan tidak valid")
		return
	}
	if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if err := h.k.AddGuruAnggota(r.Context(), id, b.GuruIDs); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Kelas tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menambah guru")
		return
	}
	list, _ := h.k.ListGuruAnggota(r.Context(), id)
	httpx.JSON(w, http.StatusOK, list)
}

func (h *Kelas) RemoveGuruAnggota(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	guruID := chi.URLParam(r, "guruId")
	if err := h.k.RemoveGuruAnggota(r.Context(), id, guruID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Kelas tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghapus guru")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}
