
        // 复制功能实现
        document.querySelectorAll('.copy-btn').forEach(button => {
            button.addEventListener('click', function() {
                const targetId = this.getAttribute('data-clipboard-target');
                const codeElement = document.querySelector(targetId);
                
                // 创建临时文本区域
                const textArea = document.createElement('textarea');
                textArea.value = codeElement.textContent;
                document.body.appendChild(textArea);
                
                // 选择并复制文本
                textArea.select();
                document.execCommand('copy');
                
                // 清理
                document.body.removeChild(textArea);
                
                // 显示复制成功反馈
                const originalText = this.textContent;
                this.textContent = '已复制!';
                this.classList.add('copied');
                
                setTimeout(() => {
                    this.textContent = originalText;
                    this.classList.remove('copied');
                }, 2000);
            });
        });
