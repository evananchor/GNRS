package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"
	"golang.org/x/crypto/bcrypt"

	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
)

// NOTE: List, Update, and SetPassword were removed from this file — they are
// defined in users.go. The versions here were stale legacy methods.

type UserStatus string

const (
	UserActive   UserStatus = "active"
	UserArchived UserStatus = "archived"
)

type CreateUserInput struct {
	Email    string
	Username *string
	Password string
	Name     string
	Role     model.Role
}

type UpdateUserInput struct {
	Name     *string
	Email    *string
	Username *string
}

type ListUsersFilter struct {
	Role   string
	Query  string
	Status string // default "active"
	Limit  int
	Offset int
}

type UserListResult struct {
	Items []model.User `json:"items"`
	Total int          `json:"total"`
}

// CreateWithBinding inserts a user and the matching primary user_roles
// binding inside a single transaction.
func (u *Users) CreateWithBinding(ctx context.Context, in CreateUserInput) (*model.User, error) {
	if in.Email == "" || in.Password == "" || in.Name == "" || in.Role == "" {
		return nil, errors.New("email, password, name and role are required")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}
	id := ulid.Make().String()
	now := time.Now().UTC()

	tx, err := u.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx,
		`INSERT INTO users (id, email, username, password, name, role, status, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
		id, strings.ToLower(strings.TrimSpace(in.Email)), in.Username, string(hash),
		strings.TrimSpace(in.Name), string(in.Role), now, now); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO user_roles (user_id, role_id, is_primary, created_at)
		 VALUES (?, ?, 1, ?)`,
		id, string(in.Role), now); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return u.FindByID(ctx, id)
}

func (u *Users) Archive(ctx context.Context, id string) error {
	res, err := u.db.ExecContext(ctx,
		`UPDATE users SET status = 'archived', refresh_jti = NULL, updated_at = ? WHERE id = ?`,
		time.Now().UTC(), id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (u *Users) Status(ctx context.Context, id string) (UserStatus, error) {
	var s string
	if err := u.db.QueryRowContext(ctx, `SELECT status FROM users WHERE id = ?`, id).Scan(&s); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", ErrNotFound
		}
		return "", err
	}
	return UserStatus(s), nil
}

func (u *Users) SetRefreshJTI(ctx context.Context, id, jti string) error {
	_, err := u.db.ExecContext(ctx,
		`UPDATE users SET refresh_jti = ?, updated_at = ? WHERE id = ?`,
		jti, time.Now().UTC(), id)
	return err
}

func (u *Users) GetRefreshJTI(ctx context.Context, id string) (string, error) {
	var jti sql.NullString
	if err := u.db.QueryRowContext(ctx, `SELECT refresh_jti FROM users WHERE id = ?`, id).Scan(&jti); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", ErrNotFound
		}
		return "", err
	}
	if !jti.Valid {
		return "", nil
	}
	return jti.String, nil
}
