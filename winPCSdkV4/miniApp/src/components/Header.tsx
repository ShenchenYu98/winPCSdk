import React from 'react';
import { AIProgressStatus } from '../types';
import { controlSkillWeCode } from '../services/jsapi';
import '../styles/Header.less';

interface HeaderProps {
  title: string;
  progress: AIProgressStatus;
  sessionId: string | null;
  isMaximized: boolean;
  onMaximize: () => void;
  onClose: () => void;
}

const Header: React.FC<HeaderProps> = ({
  title,
  progress,
  sessionId,
  isMaximized,
  onMaximize,
  onClose,
}) => {
  const getProgressIcon = () => {
    switch (progress.status) {
      case 'thinking':
        return '🤔';
      case 'processing':
        return '⚙️';
      case 'completed':
        return '✅';
      case 'error':
        return '❌';
      default:
        return '💬';
    }
  };

  const handleMinimize = async () => {
    if (sessionId) {
      try {
        await controlSkillWeCode({ action: 'minimize' });
      } catch (error) {
        console.error('最小化小程序失败:', error);
      }
    }
    onMaximize();
  };

  const handleClose = async () => {
    if (sessionId) {
      try {
        await controlSkillWeCode({ action: 'close' });
      } catch (error) {
        console.error('关闭小程序失败:', error);
      }
    }
    onClose();
  };

  return (
    <div className="header">
      <div className="text-area">
        <span className="progress-icon" title={progress.status}>
          {getProgressIcon()}
        </span>
        <span className="title-text">{title}</span>
      </div>
      <div className="action-area">
        <button
          className="icon-btn maximize-btn"
          onClick={handleMinimize}
          title={isMaximized ? '缩小' : '放大'}
        >
          {isMaximized ? '🗗' : '🗖'}
        </button>
        <button
          className="icon-btn close-btn"
          onClick={handleClose}
          title="关闭"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

export default Header;
