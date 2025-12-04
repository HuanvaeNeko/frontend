import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfileStore } from '../store/profileStore'
import { useAuthStore } from '../store/authStore'
import {
  ArrowLeft,
  User,
  Edit,
  Save,
  X,
  Camera,
  Key,
  Trash2,
  BarChart,
} from 'lucide-react'

export default function Profile() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuthStore()
  const {
    profile,
    stats,
    isLoading,
    error,
    loadProfile,
    updateProfile,
    uploadAvatar,
    changePassword,
    deleteAccount,
    loadStats,
    clearError,
  } = useProfileStore()

  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({
    nickname: '',
    email: '',
    bio: '',
    phone: '',
    birthday: '',
    gender: 'other' as 'male' | 'female' | 'other',
    location: '',
  })

  const [passwordData, setPasswordData] = useState({
    old_password: '',
    new_password: '',
    confirm_password: '',
  })

  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }

    // 加载个人资料和统计信息
    loadProfile()
    loadStats()
  }, [isAuthenticated, navigate])

  useEffect(() => {
    if (profile) {
      setFormData({
        nickname: profile.nickname || '',
        email: profile.email || '',
        bio: profile.bio || '',
        phone: profile.phone || '',
        birthday: profile.birthday || '',
        gender: profile.gender || 'other',
        location: profile.location || '',
      })
    }
  }, [profile])

  const handleEdit = () => {
    setIsEditing(true)
  }

  const handleCancel = () => {
    setIsEditing(false)
    if (profile) {
      setFormData({
        nickname: profile.nickname || '',
        email: profile.email || '',
        bio: profile.bio || '',
        phone: profile.phone || '',
        birthday: profile.birthday || '',
        gender: profile.gender || 'other',
        location: profile.location || '',
      })
    }
  }

  const handleSave = async () => {
    try {
      await updateProfile(formData)
      setIsEditing(false)
      alert('个人资料更新成功！')
    } catch (err) {
      console.error('更新失败:', err)
    }
  }

  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件')
      return
    }

    // 验证文件大小（最大 5MB）
    if (file.size > 5 * 1024 * 1024) {
      alert('图片大小不能超过 5MB')
      return
    }

    try {
      await uploadAvatar(file)
      alert('头像上传成功！')
    } catch (err) {
      console.error('上传失败:', err)
    }
  }

  const handleChangePassword = async () => {
    if (passwordData.new_password !== passwordData.confirm_password) {
      alert('两次输入的新密码不一致')
      return
    }

    if (passwordData.new_password.length < 6) {
      alert('新密码长度至少为 6 位')
      return
    }

    try {
      await changePassword({
        old_password: passwordData.old_password,
        new_password: passwordData.new_password,
      })
      setShowPasswordModal(false)
      setPasswordData({ old_password: '', new_password: '', confirm_password: '' })
      alert('密码修改成功！')
    } catch (err) {
      console.error('修改密码失败:', err)
    }
  }

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      alert('请输入密码')
      return
    }

    try {
      await deleteAccount(deletePassword)
      alert('账号已删除，即将返回登录页面')
      navigate('/login')
    } catch (err) {
      console.error('删除账号失败:', err)
    }
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 flex items-center justify-center">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      {/* Header */}
      <div className="navbar bg-base-100 shadow-lg">
        <div className="flex-1">
          <button onClick={() => navigate('/home')} className="btn btn-ghost">
            <ArrowLeft size={18} className="mr-2" />
            返回首页
          </button>
          <h1 className="text-2xl font-bold ml-4">
            <User size={20} className="mr-2 text-primary" />
            个人资料
          </h1>
        </div>
        <div className="flex-none">
          {!isEditing ? (
            <button onClick={handleEdit} className="btn btn-primary">
              <Edit size={18} className="mr-2" />
              编辑资料
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={handleCancel} className="btn btn-ghost">
                <X size={18} className="mr-2" />
                取消
              </button>
              <button onClick={handleSave} className="btn btn-success">
                <Save size={18} className="mr-2" />
                保存
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="container mx-auto p-6 max-w-5xl">
        {/* Error Alert */}
        {error && (
          <div className="alert alert-error mb-4">
            <span>{error}</span>
            <button onClick={clearError} className="btn btn-sm btn-ghost">
              <X size={18} />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Avatar & Stats */}
          <div className="space-y-6">
            {/* Avatar Card */}
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body items-center text-center">
                <div className="relative">
                  <div className="avatar placeholder">
                    <div className="w-32 rounded-full bg-primary text-primary-content ring ring-primary ring-offset-base-100 ring-offset-2">
                      {profile.avatar ? (
                        <img src={profile.avatar} alt={profile.nickname} />
                      ) : (
                        <span className="text-5xl">{profile.nickname.charAt(0)}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={handleAvatarClick}
                    className="btn btn-circle btn-primary btn-sm absolute bottom-0 right-0"
                    disabled={isLoading}
                  >
                    <Camera size={16} />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </div>
                <h2 className="card-title text-2xl mt-4">{profile.nickname}</h2>
                <p className="text-sm text-gray-500">ID: {profile.user_id}</p>
              </div>
            </div>

            {/* Stats Card */}
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h3 className="card-title">
                  <BarChart size={20} className="mr-2 text-primary" />
                  统计信息
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">好友数量</span>
                    <span className="badge badge-primary">{stats?.friends_count || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">消息数量</span>
                    <span className="badge badge-secondary">{stats?.messages_count || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">群组数量</span>
                    <span className="badge badge-accent">{stats?.groups_count || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">存储使用</span>
                    <span className="badge">{((stats?.storage_used || 0) / 1024 / 1024).toFixed(2)} MB</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions Card */}
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h3 className="card-title">账号管理</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => setShowPasswordModal(true)}
                    className="btn btn-outline btn-primary w-full"
                  >
                    <Key size={16} className="mr-2" />
                    修改密码
                  </button>
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="btn btn-outline btn-error w-full"
                  >
                    <Trash2 size={16} className="mr-2" />
                    删除账号
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Profile Details */}
          <div className="lg:col-span-2">
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h3 className="card-title mb-4">个人信息</h3>

                {/* Form Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">昵称</span>
                    </label>
                    <input
                      type="text"
                      className="input input-bordered"
                      value={formData.nickname}
                      onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                      disabled={!isEditing}
                    />
                  </div>

                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">邮箱</span>
                    </label>
                    <input
                      type="email"
                      className="input input-bordered"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      disabled={!isEditing}
                    />
                  </div>

                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">手机号</span>
                    </label>
                    <input
                      type="tel"
                      className="input input-bordered"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      disabled={!isEditing}
                      placeholder="未设置"
                    />
                  </div>

                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">生日</span>
                    </label>
                    <input
                      type="date"
                      className="input input-bordered"
                      value={formData.birthday}
                      onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
                      disabled={!isEditing}
                    />
                  </div>

                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">性别</span>
                    </label>
                    <select
                      className="select select-bordered"
                      value={formData.gender}
                      onChange={(e) => setFormData({ ...formData, gender: e.target.value as 'male' | 'female' | 'other' })}
                      disabled={!isEditing}
                    >
                      <option value="male">男</option>
                      <option value="female">女</option>
                      <option value="other">其他</option>
                    </select>
                  </div>

                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">地区</span>
                    </label>
                    <input
                      type="text"
                      className="input input-bordered"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      disabled={!isEditing}
                      placeholder="未设置"
                    />
                  </div>
                </div>

                <div className="form-control mt-4">
                  <label className="label">
                    <span className="label-text">个人简介</span>
                  </label>
                  <textarea
                    className="textarea textarea-bordered h-24"
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    disabled={!isEditing}
                    placeholder="介绍一下自己吧..."
                  />
                </div>

                {profile.created_at && (
                  <div className="mt-6 pt-4 border-t">
                    <p className="text-sm text-gray-500">
                      注册时间：{new Date(profile.created_at).toLocaleString('zh-CN')}
                    </p>
                    {profile.updated_at && (
                      <p className="text-sm text-gray-500 mt-1">
                        最后更新：{new Date(profile.updated_at).toLocaleString('zh-CN')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4">修改密码</h3>
            <div className="space-y-4">
              <div className="form-control">
                <label className="label">
                  <span className="label-text">旧密码</span>
                </label>
                <input
                  type="password"
                  className="input input-bordered"
                  value={passwordData.old_password}
                  onChange={(e) => setPasswordData({ ...passwordData, old_password: e.target.value })}
                />
              </div>
              <div className="form-control">
                <label className="label">
                  <span className="label-text">新密码</span>
                </label>
                <input
                  type="password"
                  className="input input-bordered"
                  value={passwordData.new_password}
                  onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })}
                />
              </div>
              <div className="form-control">
                <label className="label">
                  <span className="label-text">确认新密码</span>
                </label>
                <input
                  type="password"
                  className="input input-bordered"
                  value={passwordData.confirm_password}
                  onChange={(e) => setPasswordData({ ...passwordData, confirm_password: e.target.value })}
                />
              </div>
            </div>
            <div className="modal-action">
              <button
                onClick={() => {
                  setShowPasswordModal(false)
                  setPasswordData({ old_password: '', new_password: '', confirm_password: '' })
                }}
                className="btn"
              >
                取消
              </button>
              <button onClick={handleChangePassword} className="btn btn-primary" disabled={isLoading}>
                确认修改
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4 text-error">警告：删除账号</h3>
            <div className="alert alert-warning mb-4">
              <span>此操作不可恢复！删除账号后，您的所有数据将被永久删除。</span>
            </div>
            <div className="form-control">
              <label className="label">
                <span className="label-text">请输入密码以确认删除</span>
              </label>
              <input
                type="password"
                className="input input-bordered"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="请输入您的密码"
              />
            </div>
            <div className="modal-action">
              <button
                onClick={() => {
                  setShowDeleteModal(false)
                  setDeletePassword('')
                }}
                className="btn"
              >
                取消
              </button>
              <button onClick={handleDeleteAccount} className="btn btn-error" disabled={isLoading}>
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

