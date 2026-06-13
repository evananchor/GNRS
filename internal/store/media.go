package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"
)

// LibraryMedia is a slide deck (ppt) or video embed link stored in the
// library and optionally shown ad-hoc on the Live Stage via
// sesi.live_media_id.
type LibraryMedia struct {
	ID          string  `json:"id"`
	Type        string  `json:"type"`
	Title       string  `json:"title"`
	URL         string  `json:"url"`
	Description *string `json:"description,omitempty"`
	CreatedBy   *string `json:"createdBy,omitempty"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
}

// LibraryMediaInput carries the mutable fields for Create and Update.
type LibraryMediaInput struct {
	Type        string
	Title       string
	URL         string
	Description *string
	CreatedBy   *string
}

type LibraryMediaStore struct {
	db *sql.DB
}

func NewLibraryMedia(db *sql.DB) *LibraryMediaStore { return &LibraryMediaStore{db: db} }

const mediaCols = `id, type, title, url, description, created_by, created_at, updated_at`

func (s *LibraryMediaStore) List(ctx context.Context) ([]LibraryMedia, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+mediaCols+` FROM library_media ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []LibraryMedia{}
	for rows.Next() {
		v, err := scanMedia(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *v)
	}
	return out, rows.Err()
}

func (s *LibraryMediaStore) Get(ctx context.Context, id string) (*LibraryMedia, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT `+mediaCols+` FROM library_media WHERE id = ?`, id)
	v, err := scanMedia(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return v, nil
}

func (s *LibraryMediaStore) Create(ctx context.Context, in LibraryMediaInput) (*LibraryMedia, error) {
	id := ulid.Make().String()
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO library_media (id, type, title, url, description, created_by, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		id, in.Type, in.Title, in.URL, in.Description, in.CreatedBy, now, now,
	)
	if err != nil {
		return nil, err
	}
	return s.Get(ctx, id)
}

func (s *LibraryMediaStore) Update(ctx context.Context, id string, in LibraryMediaInput) (*LibraryMedia, error) {
	sets := []string{}
	args := []any{}
	if in.Type != "" {
		sets = append(sets, "type = ?")
		args = append(args, in.Type)
	}
	if in.Title != "" {
		sets = append(sets, "title = ?")
		args = append(args, in.Title)
	}
	if in.URL != "" {
		sets = append(sets, "url = ?")
		args = append(args, in.URL)
	}
	if in.Description != nil {
		sets = append(sets, "description = ?")
		if *in.Description == "" {
			args = append(args, nil)
		} else {
			args = append(args, *in.Description)
		}
	}
	if len(sets) == 0 {
		return s.Get(ctx, id)
	}
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	sets = append(sets, "updated_at = ?")
	args = append(args, now, id)
	res, err := s.db.ExecContext(ctx,
		`UPDATE library_media SET `+strings.Join(sets, ", ")+` WHERE id = ?`, args...,
	)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, ErrNotFound
	}
	return s.Get(ctx, id)
}

func (s *LibraryMediaStore) Delete(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM library_media WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func scanMedia(s scanner) (*LibraryMedia, error) {
	var v LibraryMedia
	if err := s.Scan(
		&v.ID, &v.Type, &v.Title, &v.URL,
		&v.Description, &v.CreatedBy,
		&v.CreatedAt, &v.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return &v, nil
}
